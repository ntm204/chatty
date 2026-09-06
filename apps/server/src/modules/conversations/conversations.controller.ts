import type { Request, Response } from "express";
import { ValidationError } from "../../lib/errors.js";
import {
	addParticipantSchema,
	archiveConversationSchema,
	createConversationSchema,
	listConversationsQuerySchema,
	markReadSchema,
	muteConversationSchema,
	pinConversationSchema,
	renameConversationSchema,
	setInvitePolicySchema,
	setNicknameSchema,
	setParticipantRoleSchema,
	setQuickReactionSchema,
	setThemeSchema,
} from "./conversations.schema.js";
import * as conversationsService from "./conversations.service.js";

/** Same value as `users.controller.ts`'s — a year, immutable, safe because the URL carries the upload timestamp. */
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

// req.userId is always set here: requireAuth runs before these controllers (see conversations.routes.ts)

export async function createConversationController(req: Request, res: Response): Promise<void> {
	const input = createConversationSchema.parse(req.body);
	const conversation = await conversationsService.createConversation(req.userId!, input);
	res.status(201).json(conversation);
}

export async function listConversationsController(req: Request, res: Response): Promise<void> {
	const query = listConversationsQuerySchema.parse(req.query);
	const page = await conversationsService.listConversationsForUser(req.userId!, {
		isArchived: query.archived,
		...(query.limit === undefined ? {} : { limit: query.limit }),
		...(query.before === undefined ? {} : { before: query.before }),
	});
	res.status(200).json(page);
}

export async function getConversationController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	res.status(200).json(await conversationsService.getConversationForUser(req.userId!, conversationId));
}

export async function archiveConversationController(req: Request, res: Response): Promise<void> {
	const input = archiveConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationArchived(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
}

export async function pinConversationController(req: Request, res: Response): Promise<void> {
	const input = pinConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationPinned(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
}

export async function muteConversationController(req: Request, res: Response): Promise<void> {
	const input = muteConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationMuted(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
}

export async function setNicknameController(req: Request, res: Response): Promise<void> {
	const input = setNicknameSchema.parse(req.body);
	const conversation = await conversationsService.setConversationNickname(
		req.userId!,
		req.params.conversationId as string,
		req.params.userId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function setThemeController(req: Request, res: Response): Promise<void> {
	const input = setThemeSchema.parse(req.body);
	const conversation = await conversationsService.setConversationTheme(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function setQuickReactionController(req: Request, res: Response): Promise<void> {
	const input = setQuickReactionSchema.parse(req.body);
	const conversation = await conversationsService.setConversationQuickReaction(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function uploadConversationAvatarController(req: Request, res: Response): Promise<void> {
	if (!req.file) throw new ValidationError('Attach an image in an "avatar" field');
	const conversation = await conversationsService.setConversationPhoto(
		req.userId!,
		req.params.conversationId as string,
		req.file.buffer,
	);
	res.status(200).json(conversation);
}

export async function deleteConversationAvatarController(req: Request, res: Response): Promise<void> {
	const conversation = await conversationsService.removeConversationPhoto(
		req.userId!,
		req.params.conversationId as string,
	);
	res.status(200).json(conversation);
}

export async function getConversationAvatarController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	const filePath = await conversationsService.getConversationAvatarFilePath(conversationId);

	res.setHeader("Cache-Control", AVATAR_CACHE_CONTROL);
	// See users.controller.ts's getAvatarController for why `dotfiles: "allow"` is required.
	res.status(200).sendFile(filePath, { dotfiles: "allow" });
}

export async function markReadController(req: Request, res: Response): Promise<void> {
	const input = markReadSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const event = await conversationsService.markConversationRead(req.userId!, conversationId, input);
	res.status(200).json(event);
}

export async function addParticipantController(req: Request, res: Response): Promise<void> {
	const input = addParticipantSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.addParticipant(req.userId!, conversationId, input);
	res.status(201).json(conversation);
}

export async function removeParticipantController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	const targetUserId = req.params.userId as string;
	await conversationsService.removeParticipant(req.userId!, conversationId, targetUserId);
	// No body: the actor and the target both learn what happened from socket
	// events, not from this response — see removeParticipant's doc comment.
	res.status(204).send();
}

export async function setParticipantRoleController(req: Request, res: Response): Promise<void> {
	const input = setParticipantRoleSchema.parse(req.body);
	const conversation = await conversationsService.setParticipantRole(
		req.userId!,
		req.params.conversationId as string,
		req.params.userId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function setInvitePolicyController(req: Request, res: Response): Promise<void> {
	const input = setInvitePolicySchema.parse(req.body);
	const conversation = await conversationsService.setGroupInvitePolicy(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function renameConversationController(req: Request, res: Response): Promise<void> {
	const input = renameConversationSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.renameConversation(req.userId!, conversationId, input);
	res.status(200).json(conversation);
}
