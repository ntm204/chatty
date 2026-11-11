/**
 * Changing a message after it was sent: the author's edits (and their history),
 * delete-for-everyone tombstones, and hide-for-me.
 */
import type { MessageDTO, MessageEditDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { deleteAttachment } from "../../lib/attachment-storage.js";
import { extractLinks } from "../../lib/extract-links.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { assertDirectConversationAvailable } from "../blocks/blocks.service.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO } from "./messages.mapper.js";
import { MESSAGE_AUTHOR_ACTION_WINDOW_MS } from "./messages.constants.js";
import type { EditMessageInput } from "./messages.schema.js";

/**
 * What survives the authorization check: the two facts either operation still
 * has to branch on. Everything else the check consumed — kind, author — has
 * already done its job by the time this is returned.
 */
interface EditableMessage {
	deletedAt: Date | null;
	attachmentIds: string[];
	content: string;
	createdAt: Date;
}

/**
 * Loads a message the caller is allowed to change, with the conversation locked.
 *
 * The lock is the same one `sendMessage` and every group mutation take, for the
 * same reason: it puts a change to a message and a change to who is in the
 * conversation into one honest order. Without it, someone removed from a group
 * could pass the membership check a moment before the removal commits.
 *
 * Called inside the caller's transaction rather than opening its own, so the
 * lock is still held when the write happens — taking it and letting go before
 * the update would order nothing.
 */
async function loadEditableMessage(
	transaction: Prisma.TransactionClient,
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<EditableMessage> {
	await transaction.$queryRaw`
		SELECT id
		FROM "Conversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;

	await assertParticipant(currentUserId, conversationId, transaction);
	await assertDirectConversationAvailable(currentUserId, conversationId, transaction);

	const message = await transaction.message.findUnique({
		where: { id: messageId },
		select: {
			conversationId: true,
			kind: true,
			authorId: true,
			deletedAt: true,
			content: true,
			createdAt: true,
			attachments: { select: { id: true }, orderBy: { position: "asc" } },
		},
	});

	// One error for "no such message" and for "a message in a conversation you
	// are in, but not this one", so neither can be used to probe for ids — the
	// same reasoning `markConversationRead` already uses.
	if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

	// Nobody wrote a system line, so there is nobody who may rewrite it. The
	// database refuses this too (see the phase 8 migration); this is the check
	// that produces a 403 instead of a 500.
	if (message.kind === "SYSTEM") throw new ForbiddenError("A system message cannot be edited or deleted");

	// ForbiddenError, not NotFoundError: the caller is already known to be in this
	// conversation and can see the message perfectly well, so hiding behind a 404
	// would only leave the UI unable to say why nothing happened.
	if (message.authorId !== currentUserId) throw new ForbiddenError("Only the author can change a message");

	return {
		deletedAt: message.deletedAt,
		attachmentIds: message.attachments.map((attachment) => attachment.id),
		content: message.content,
		createdAt: message.createdAt,
	};
}

/**
 * Replaces the text of a message the caller wrote.
 *
 * Deliberately leaves `Conversation.updatedAt` alone, unlike `sendMessage`:
 * fixing a typo in something sent last week is not new activity, and bumping it
 * would throw the thread to the top of everyone's sidebar with nothing new in
 * it. The sidebar *preview* still changes, because it reads the newest message
 * rather than a stored copy.
 */
export async function editMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	input: EditMessageInput,
): Promise<MessageDTO> {
	// Trimmed once, so the emptiness check and the stored value agree — the same
	// rule `sendMessageController` applies on the way in.
	const content = input.content.trim();

	const updated = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		// Editing a tombstone would have to un-delete it, and "deleted" is the one
		// state everyone else has already been told about.
		if (message.deletedAt) throw new ValidationError("This message was deleted");
		if (Date.now() - message.createdAt.getTime() >= MESSAGE_AUTHOR_ACTION_WINDOW_MS) {
			throw new ValidationError("Messages can only be edited for 8 hours");
		}

		// The send rule, restated where it still applies: a message has to be
		// something. Clearing the caption of a picture is fine; clearing the whole
		// of a text message leaves an empty bubble that only delete should produce.
		if (!content && message.attachmentIds.length === 0) {
			throw new ValidationError("A message needs text, an image, or both");
		}

		await transaction.messageEdit.create({
			data: { messageId, content: message.content },
			select: { id: true },
		});
		await transaction.messageLink.deleteMany({ where: { messageId } });
		await transaction.messageMention.deleteMany({ where: { messageId } });
		// Derive edit mentions from current membership under the conversation lock.
		// Editing does not emit message:new, so this cannot replay arrival alerts.
		const conversation = await transaction.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { isGroup: true },
		});
		if (conversation.isGroup) {
			const handles = [
				...new Set(
					[...content.matchAll(/(?:^|\s)@([a-z0-9_.-]+)(?=\s|$)/giu)].map((match) => match[1]!.toLowerCase()),
				),
			];
			const mentions = handles.length
				? await transaction.conversationParticipant.findMany({
						where: { conversationId, user: { handle: { in: handles } } },
						select: { userId: true },
					})
				: [];
			if (mentions.length > 50) throw new ValidationError("A message can mention up to 50 participants");
			if (mentions.length)
				await transaction.messageMention.createMany({
					data: mentions.map(({ userId }) => ({ messageId, userId })),
				});
		}
		const links = extractLinks(content);
		if (links.length > 0) {
			await transaction.messageLink.createMany({
				data: links.map((url, position) => ({ messageId, conversationId, url, position })),
			});
		}

		return transaction.message.update({
			where: { id: messageId },
			data: { content, editedAt: new Date() },
			select: messageSelect,
		});
	});

	const messageDTO = toMessageDTO(updated);

	getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}

export async function listMessageEdits(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<MessageEditDTO[]> {
	await assertParticipant(currentUserId, conversationId);
	const message = await prisma.message.findFirst({
		where: { id: messageId, conversationId, deletedAt: null, hiddenFor: { none: { userId: currentUserId } } },
		select: { edits: { orderBy: { editedAt: "desc" }, select: { id: true, content: true, editedAt: true } } },
	});
	if (!message) throw new NotFoundError("Message not found");

	return message.edits.map((edit) => ({ ...edit, editedAt: edit.editedAt.toISOString() }));
}

export async function hideMessageForUser(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<void> {
	await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;
		await assertParticipant(currentUserId, conversationId, transaction);
		const message = await transaction.message.findFirst({
			where: { id: messageId, conversationId },
			select: { id: true },
		});
		if (!message) throw new NotFoundError("Message not found");

		await transaction.messageHiddenFor.upsert({
			where: { messageId_userId: { messageId, userId: currentUserId } },
			create: { messageId, userId: currentUserId },
			update: {},
		});
	});
	getIO().to(userRoom(currentUserId)).emit("message:hidden", { conversationId, messageId });
}

/**
 * Deletes a message the caller wrote, leaving a tombstone in its place.
 *
 * Idempotent: deleting an already-deleted message returns it unchanged and
 * broadcasts nothing. Two tabs pressing the button is the ordinary case, not an
 * error worth reporting.
 */
export async function deleteMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<MessageDTO> {
	const { deleted, removedAttachmentIds, wasAlreadyDeleted } = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		// Also clean pre-fix tombstones when an old delete is replayed.
		await transaction.messageEdit.deleteMany({ where: { messageId } });

		if (message.deletedAt) {
			const unchanged = await transaction.message.findUniqueOrThrow({
				where: { id: messageId },
				select: messageSelect,
			});

			return { deleted: unchanged, removedAttachmentIds: [], wasAlreadyDeleted: true };
		}
		if (Date.now() - message.createdAt.getTime() >= MESSAGE_AUTHOR_ACTION_WINDOW_MS) {
			throw new ValidationError("Messages can only be deleted for everyone for 8 hours");
		}

		// The attachment rows go with the text. Leaving them would keep serving the
		// pictures — the images are the part of an image message worth deleting.
		if (message.attachmentIds.length > 0) {
			await transaction.attachment.deleteMany({ where: { messageId } });
		}
		await transaction.messageLink.deleteMany({ where: { messageId } });
		await transaction.messageMention.deleteMany({ where: { messageId } });

		const updated = await transaction.message.update({
			where: { id: messageId },
			// Emptied, not hidden: a client that forgets to check `deletedAt` then
			// renders nothing rather than the message. The check constraint added
			// with this feature is what keeps that true of every future write.
			data: { content: "", deletedAt: new Date() },
			select: messageSelect,
		});

		return { deleted: updated, removedAttachmentIds: message.attachmentIds, wasAlreadyDeleted: false };
	});

	// After the commit, and on purpose. The other order — file first — leaves a
	// message pointing at a picture that is gone if the transaction then rolls
	// back, which is the broken-image case `sendMessage` also refuses to risk.
	// A crash here instead leaves an unreferenced file, which costs bytes.
	for (const attachmentId of removedAttachmentIds) {
		await deleteAttachment(attachmentId).catch((error: unknown) => {
			// Not rethrown, and the loop is not abandoned: the message *is* deleted,
			// and failing the request now would tell the caller otherwise. One file
			// that will not unlink must not strand the nine behind it either — each
			// is independent, and the sweep picks up whatever is left.
			logger.error({ err: error, attachmentId }, "failed to remove attachment file");
		});
	}

	const messageDTO = toMessageDTO(deleted);

	// Nothing to announce when it was already a tombstone: everyone was told the
	// first time, and a second event would only re-render what is already there.
	if (!wasAlreadyDeleted) getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}
