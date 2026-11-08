import type { Request, Response } from "express";
import { ValidationError } from "../../lib/errors.js";
import { observeMessageUploadBytes, startMessageSendTimer, type MessageMetricKind } from "../../lib/metrics.js";
import { MAX_FILE_BYTES, MAX_VOICE_UPLOAD_BYTES } from "../../middlewares/upload-image.js";
import {
	editMessageSchema,
	listMessagesQuerySchema,
	messageContextQuerySchema,
	sendMessageSchema,
	toggleReactionSchema,
} from "./messages.schema.js";
import * as messagesService from "./messages.service.js";

// req.userId is always set here: requireAuth runs before these controllers (see messages.routes.ts)

export async function sendMessageController(req: Request, res: Response): Promise<void> {
	const input = sendMessageSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	// Trimmed here, once, so the emptiness check and the stored value agree — a
	// caption of three spaces is not a caption.
	const content = input.content?.trim() ?? "";

	// `upload.array` puts the files here. Narrowed rather than trusted: the typing
	// allows multer's field-map form, which this route never uses.
	const uploaded = !Array.isArray(req.files) && req.files ? req.files : {};
	const images = uploaded.attachment ?? [];
	const file = uploaded.file?.[0];
	const voice = uploaded.voice?.[0];
	if (images.some((image) => image.size > 10 * 1024 * 1024)) {
		throw new ValidationError("Image must be smaller than 10MB");
	}
	if (file && file.size > MAX_FILE_BYTES) throw new ValidationError("File must be smaller than 25MB");
	if (voice && voice.size > MAX_VOICE_UPLOAD_BYTES) {
		throw new ValidationError("Voice message must be smaller than 16MB");
	}

	// The one rule that spans body and files, so it cannot live in either schema:
	// a message has to be something. Without it, posting `{}` stores a row with
	// no text and no image that renders as an empty bubble nobody can delete.
	if (
		!content &&
		images.length === 0 &&
		!file &&
		!voice &&
		!input.stickerId &&
		!input.stickerKey &&
		!input.forwardOfMessageId
	) {
		throw new ValidationError("A message needs text or an attachment");
	}

	// A sticker is the whole message. Letting it arrive alongside a caption or
	// files would mean deciding how a bare, oversized image composes with a
	// bubble, and there is no answer to that worth having.
	const isSticker = Boolean(input.stickerId || input.stickerKey);
	if (
		isSticker &&
		(content ||
			images.length > 0 ||
			file ||
			voice ||
			input.forwardOfMessageId ||
			(input.stickerId && input.stickerKey))
	) {
		throw new ValidationError("A sticker is sent on its own");
	}
	if (images.length > 0 && file) throw new ValidationError("Send images or one file, not both");
	if (voice && (content || images.length > 0 || file || isSticker || input.forwardOfMessageId)) {
		throw new ValidationError("A voice message is sent on its own");
	}
	if (input.forwardOfMessageId && (content || images.length > 0 || file || voice || isSticker)) {
		throw new ValidationError("A forwarded message is sent on its own");
	}

	const metricKind: MessageMetricKind = voice
		? "voice"
		: file
			? "file"
			: images.length > 0
				? "image"
				: isSticker
					? "sticker"
					: input.forwardOfMessageId
						? "forward"
						: "text";
	const uploadBytes = images.reduce((total, image) => total + image.size, 0) + (file?.size ?? 0) + (voice?.size ?? 0);
	const stopTimer = startMessageSendTimer(metricKind);
	observeMessageUploadBytes(metricKind, uploadBytes);

	try {
		const message = await messagesService.sendMessage(req.userId!, conversationId, {
			content,
			...(input.replyToId ? { replyToId: input.replyToId } : {}),
			...(input.stickerId ? { stickerId: input.stickerId } : {}),
			...(input.stickerKey ? { stickerKey: input.stickerKey } : {}),
			...(input.forwardOfMessageId ? { forwardOfMessageId: input.forwardOfMessageId } : {}),
			...(input.mentionedUserIds ? { mentionedUserIds: input.mentionedUserIds } : {}),
			...(input.clientId ? { clientId: input.clientId } : {}),
			...(images.length > 0 ? { attachments: images.map((image) => image.buffer) } : {}),
			...(file ? { file: { buffer: file.buffer, fileName: file.originalname } } : {}),
			...(voice ? { voice: voice.buffer } : {}),
		});
		stopTimer("success");
		res.status(201).json(message);
	} catch (error) {
		stopTimer("error");
		throw error;
	}
}

export async function editMessageController(req: Request, res: Response): Promise<void> {
	const input = editMessageSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const messageId = req.params.messageId as string;

	const message = await messagesService.editMessage(req.userId!, conversationId, messageId, input);
	res.status(200).json(message);
}

/**
 * Answers 200 with the tombstone rather than the 204 `removeParticipant` uses.
 *
 * The difference is that there is still a resource here: a deleted message keeps
 * its place in the conversation, and the caller's own view has to render it as
 * one. Nothing to describe is what earns a 204.
 */
export async function deleteMessageController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	const messageId = req.params.messageId as string;

	const message = await messagesService.deleteMessage(req.userId!, conversationId, messageId);
	res.status(200).json(message);
}

export async function listMessagesController(req: Request, res: Response): Promise<void> {
	const query = listMessagesQuerySchema.parse(req.query);
	const conversationId = req.params.conversationId as string;
	const messages = await messagesService.listMessages(req.userId!, conversationId, query);
	res.status(200).json(messages);
}

export async function getMessageContextController(req: Request, res: Response): Promise<void> {
	const query = messageContextQuerySchema.parse(req.query);
	const context = await messagesService.getMessageContext(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		query,
	);
	res.status(200).json(context);
}

export async function listMessageEditsController(req: Request, res: Response): Promise<void> {
	const edits = await messagesService.listMessageEdits(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(200).json(edits);
}

export async function hideMessageController(req: Request, res: Response): Promise<void> {
	await messagesService.hideMessageForUser(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(204).send();
}

/**
 * PUT rather than POST: the request states what the caller's reaction of this
 * kind should be, and sending it twice settles on the same place it started —
 * which is what a toggle is. 200 with the message, because the message is what
 * the caller renders.
 */
export async function toggleReactionController(req: Request, res: Response): Promise<void> {
	const input = toggleReactionSchema.parse(req.body);

	const message = await messagesService.toggleReaction(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		input,
	);
	res.status(200).json(message);
}

export async function saveMessageController(req: Request, res: Response): Promise<void> {
	await messagesService.saveMessageForUser(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(204).send();
}

export async function removeSavedMessageController(req: Request, res: Response): Promise<void> {
	await messagesService.removeSavedMessage(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(204).send();
}

export async function pinMessageController(req: Request, res: Response): Promise<void> {
	const pinnedMessages = await messagesService.setMessagePinned(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		true,
	);
	res.status(200).json(pinnedMessages);
}

export async function unpinMessageController(req: Request, res: Response): Promise<void> {
	const pinnedMessages = await messagesService.setMessagePinned(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		false,
	);
	res.status(200).json(pinnedMessages);
}
