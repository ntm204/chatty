/**
 * How a conversation looks to everyone in it: nicknames, theme, quick reaction
 * and the group photo.
 */
import type { ConversationDTO } from "@chatty/shared-types";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
	deleteConversationAvatar,
	findConversationAvatarPath,
	saveConversationAvatar,
} from "../../lib/conversation-avatar-storage.js";
import { themeFromWire } from "../../lib/theme-wire.js";
import { toConversationDTO, toConversationUpdatedEvent } from "./conversations.mapper.js";
import type {
	SetMessageTimerInput,
	SetNicknameInput,
	SetQuickReactionInput,
	SetSharingRestrictionInput,
	SetThemeInput,
} from "./conversations.schema.js";
import {
	announceConversationUpdated,
	announceSystemMessage,
	assertAdmin,
	assertParticipant,
	countUnreadByConversation,
	createSystemMessage,
	describeMessageTimer,
	displayNamesOf,
	prepareGroupMutation,
	reloadConversation,
} from "./conversations.shared.js";

/**
 * Sets how everyone in this conversation sees one participant labeled.
 *
 * Shared, not private — this replaced a model that kept one label for the
 * whole conversation, visible only to whoever set it. See ADR 0022 for why
 * that stopped matching what "nickname" means everywhere else this app is
 * measured against. Any participant may set or clear anyone's, including
 * their own: cosmetic, not moderation, so there is no admin gate.
 */
export async function setConversationNickname(
	currentUserId: string,
	conversationId: string,
	targetUserId: string,
	input: SetNicknameInput,
): Promise<ConversationDTO> {
	await assertParticipant(currentUserId, conversationId);

	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		const target = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
			select: { nickname: true, user: { select: { displayName: true } } },
		});
		if (!target) throw new NotFoundError("Not a participant of this conversation");
		if (target.nickname === input.nickname) {
			return { systemMessage: null, updated: await reloadConversation(transaction, conversationId) };
		}

		await transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
			data: { nickname: input.nickname },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			input.nickname
				? `${actorName} set ${target.user.displayName}'s nickname to "${input.nickname}"`
				: `${actorName} removed ${target.user.displayName}'s nickname`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	if (systemMessage) {
		announceSystemMessage(systemMessage);
		announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	}
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Replaces the conversation's shared accent, or clears it back to the fixed
 * default. Cosmetic and symmetric with the quick-reaction override below: any
 * participant may change it, in a group or a direct conversation alike.
 */
export async function setConversationTheme(
	currentUserId: string,
	conversationId: string,
	input: SetThemeInput,
): Promise<ConversationDTO> {
	await assertParticipant(currentUserId, conversationId);
	const nextTheme = input.theme ? themeFromWire(input.theme) : null;

	const { didChange, updated } = await prisma.$transaction(async (transaction) => {
		const conversation = await transaction.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { themeColor: true },
		});
		if (conversation.themeColor === nextTheme) {
			return { didChange: false, updated: await reloadConversation(transaction, conversationId) };
		}

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { themeColor: nextTheme },
			select: { id: true },
		});

		return { didChange: true, updated: await reloadConversation(transaction, conversationId) };
	});

	if (didChange) announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Replaces the conversation's shared default reaction (what a double-click on
 * a bubble leaves), or clears it back to the app-wide `DEFAULT_REACTION`.
 * Cosmetic, any participant may change it.
 */
export async function setConversationQuickReaction(
	currentUserId: string,
	conversationId: string,
	input: SetQuickReactionInput,
): Promise<ConversationDTO> {
	await assertParticipant(currentUserId, conversationId);

	const { didChange, updated } = await prisma.$transaction(async (transaction) => {
		const conversation = await transaction.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { quickReactionEmoji: true },
		});
		if (conversation.quickReactionEmoji === input.emoji) {
			return { didChange: false, updated: await reloadConversation(transaction, conversationId) };
		}

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { quickReactionEmoji: input.emoji },
			select: { id: true },
		});

		return { didChange: true, updated: await reloadConversation(transaction, conversationId) };
	});

	if (didChange) announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Turns disappearing messages on, changes their lifetime, or turns them off.
 *
 * Not cosmetic, so not open to everyone the way theme is: in a group it changes
 * what happens to everybody's words, so it is admin-gated like the group's other
 * rules. In a direct conversation either person may change it — there is nobody
 * to administer between two, and a setting only one of them could turn off would
 * be a setting one person imposes on the other.
 *
 * Every change writes a system line, by name. That is the fairness half of the
 * feature: nothing about how long messages last changes without both sides being
 * told who changed it. Never retroactive — messages already sent keep the
 * `expiresAt` they were written with. See ADR 0023.
 */
export async function setConversationMessageTimer(
	currentUserId: string,
	conversationId: string,
	input: SetMessageTimerInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		const locked = await transaction.$queryRaw<{ isGroup: boolean; messageTimerSeconds: number | null }[]>`
			SELECT "isGroup", "messageTimerSeconds" FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE
		`;
		await assertParticipant(currentUserId, conversationId, transaction);
		const conversation = locked[0];
		if (!conversation) throw new NotFoundError("Conversation not found");
		if (conversation.isGroup) await assertAdmin(transaction, currentUserId, conversationId);
		if (conversation.messageTimerSeconds === input.seconds) {
			return { systemMessage: null, updated: await reloadConversation(transaction, conversationId) };
		}

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { messageTimerSeconds: input.seconds },
			select: { id: true },
		});
		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			input.seconds === null
				? `${actorName} turned off disappearing messages`
				: `${actorName} set new messages to disappear after ${describeMessageTimer(input.seconds)}`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	if (systemMessage) {
		announceSystemMessage(systemMessage);
		announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	}
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Turns the conversation's sharing restriction on or off.
 *
 * Same rules as the disappearing timer, for the same reasons: admin-gated in a
 * group, open to either person in a direct chat, and always announced by name —
 * so nobody can quietly lift the restriction, forward something, and put it
 * back. See ADR 0024.
 */
export async function setConversationSharingRestriction(
	currentUserId: string,
	conversationId: string,
	input: SetSharingRestrictionInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		const locked = await transaction.$queryRaw<{ isGroup: boolean; restrictSharing: boolean }[]>`
			SELECT "isGroup", "restrictSharing" FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE
		`;
		await assertParticipant(currentUserId, conversationId, transaction);
		const conversation = locked[0];
		if (!conversation) throw new NotFoundError("Conversation not found");
		if (conversation.isGroup) await assertAdmin(transaction, currentUserId, conversationId);
		if (conversation.restrictSharing === input.isRestricted) {
			return { systemMessage: null, updated: await reloadConversation(transaction, conversationId) };
		}

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { restrictSharing: input.isRestricted },
			select: { id: true },
		});
		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			input.isRestricted
				? `${actorName} turned off forwarding in this chat`
				: `${actorName} turned forwarding back on in this chat`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	if (systemMessage) {
		announceSystemMessage(systemMessage);
		announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	}
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Replaces a group's photo. Group-only and admin-gated, unlike the cosmetic
 * settings above — a group's photo is part of its identity the same way its
 * name is, not a personal preference. `prepareGroupMutation` both asserts
 * `isGroup` and takes the row lock the rest of this module's group mutations
 * share.
 */
export async function setConversationPhoto(
	currentUserId: string,
	conversationId: string,
	upload: Buffer,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertAdmin(transaction, currentUserId, conversationId);

		await saveConversationAvatar(conversationId, upload);
		await transaction.conversation.update({
			where: { id: conversationId },
			data: { avatarUpdatedAt: new Date() },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(transaction, conversationId, `${actorName} changed the group photo`);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	announceSystemMessage(systemMessage);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/** Removes a group's photo, falling it back to initials. Group-only and admin-gated, like setting one. */
export async function removeConversationPhoto(currentUserId: string, conversationId: string): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertAdmin(transaction, currentUserId, conversationId);

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { avatarUpdatedAt: null },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(transaction, conversationId, `${actorName} removed the group photo`);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	// After the commit, same ordering `saveAvatar`/`clearAvatar` use on the user
	// side: the database is the source of truth for whether a photo exists, so
	// the file only goes once the row already says it's gone.
	await deleteConversationAvatar(conversationId);
	announceSystemMessage(systemMessage);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/** Path of the file to serve for `GET /conversations/:id/avatar`. Mirrors `users.service`'s `getAvatarFilePath`. */
export async function getConversationAvatarFilePath(conversationId: string): Promise<string> {
	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
		select: { avatarUpdatedAt: true },
	});
	if (!conversation?.avatarUpdatedAt) throw new NotFoundError("No photo set");

	const filePath = await findConversationAvatarPath(conversationId);
	if (!filePath) throw new NotFoundError("No photo set");

	return filePath;
}
