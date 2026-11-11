/**
 * Who is in a group and who runs it: adding and removing participants, roles,
 * rename, invite policy, admin succession, and leaving every group when an
 * account is deleted.
 */
import type { ConversationDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import type { MessageRow } from "../messages/messages.mapper.js";
import { toConversationDTO, toConversationUpdatedEvent, type ConversationRow } from "./conversations.mapper.js";
import type {
	AddParticipantInput,
	RenameConversationInput,
	SetInvitePolicyInput,
	SetParticipantRoleInput,
} from "./conversations.schema.js";
import {
	announceConversationUpdated,
	announceNewConversation,
	announceSystemMessage,
	assertAdmin,
	countUnreadByConversation,
	createSystemMessage,
	displayNamesOf,
	prepareGroupMutation,
	reloadConversation,
	subscribeParticipantsToRoom,
} from "./conversations.shared.js";

/**
 * Drops one user's live sockets out of a conversation's room.
 *
 * The inverse of `subscribeParticipantsToRoom`, needed for the same reason in
 * reverse: room membership is what decides who a broadcast reaches, so a
 * removed participant whose sockets are still in the room would keep
 * receiving `message:new` for a conversation the database says they left.
 */
async function evictParticipantFromRoom(userId: string, conversationId: string): Promise<void> {
	await getIO().in(userRoom(userId)).socketsLeave(conversationId);
}

/**
 * Tells one user, on every device, that they are no longer in a conversation.
 *
 * Addressed to their personal room rather than the conversation room: their
 * sockets have just been evicted from that room, so it is the only channel
 * left that still reaches them.
 */
function announceParticipantLeft(userId: string, conversationId: string): void {
	getIO().to(userRoom(userId)).emit("conversation:left", { conversationId });
}

/**
 * Promotes the longest-standing remaining member to admin, if the group has
 * none left, and says so in the log.
 *
 * Called whenever removing or demoting a participant could leave a group with
 * zero admins — the last admin leaving, being kicked, or demoting themselves.
 * Without it the group would be left with nobody able to rename it, moderate
 * it, or grant the role again.
 *
 * Oldest membership wins, ties broken by id — arbitrary but stable, and the
 * same ordering the original owner-succession rule used.
 */
async function promoteNextAdmin(
	transaction: Prisma.TransactionClient,
	conversationId: string,
): Promise<MessageRow | null> {
	const adminCount = await transaction.conversationParticipant.count({ where: { conversationId, role: "ADMIN" } });
	if (adminCount > 0) return null;

	const successor = await transaction.conversationParticipant.findFirst({
		where: { conversationId },
		orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
		select: { id: true, user: { select: { displayName: true } } },
	});

	// The last person out of a group leaves nobody to promote. Allowed: nothing
	// in this app deletes a conversation, and an empty one is simply unreachable.
	if (!successor) return null;

	await transaction.conversationParticipant.update({
		where: { id: successor.id },
		data: { role: "ADMIN" },
		select: { id: true },
	});

	return createSystemMessage(transaction, conversationId, `${successor.user.displayName} is now a group admin`);
}

/**
 * Adds one member to a group conversation.
 *
 * Returns the conversation as seen by the person who added them (their own
 * `unreadCount`, unaffected by this call) — the HTTP response an actor gets
 * for their own action. Everyone else learns about it from two different
 * socket events, not from this return value: the new member gets
 * `conversation:new`, which fixes a known gap — until now that event only
 * fired when a conversation was first created, so someone added to an
 * existing group never saw it appear in their sidebar until they reloaded.
 * Everyone already in the room gets `conversation:updated`.
 *
 * Open by default for compatibility. Any admin may choose MANAGERS, in which
 * case only admins can invite while ordinary members get a clear 403.
 */
export async function addParticipant(
	currentUserId: string,
	conversationId: string,
	input: AddParticipantInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		const group = await prepareGroupMutation(transaction, currentUserId, conversationId);
		if (group.invitePolicy === "MANAGERS") {
			await assertAdmin(transaction, currentUserId, conversationId);
		}

		const targetUser = await transaction.user.findUnique({ where: { id: input.userId }, select: { id: true } });
		if (!targetUser) throw new NotFoundError("User not found");

		const alreadyIn = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: input.userId } },
			select: { id: true },
		});
		if (alreadyIn) throw new ConflictError("Already a participant of this conversation");

		await transaction.conversationParticipant.create({ data: { conversationId, userId: input.userId } });

		const [actorName, targetName] = await displayNamesOf(transaction, [currentUserId, input.userId]);
		const message = await createSystemMessage(transaction, conversationId, `${actorName} added ${targetName}`);
		const conversation = await reloadConversation(transaction, conversationId);

		return { systemMessage: message, updated: conversation };
	});

	// Database state is committed before socket state changes. Join before any
	// announcement so the new member receives the same message:new event as the
	// people who were already in the room.
	await subscribeParticipantsToRoom([input.userId], conversationId);
	announceSystemMessage(systemMessage);

	const newMemberUnread = await countUnreadByConversation(input.userId, [conversationId]);
	announceNewConversation(
		[input.userId],
		toConversationDTO(updated, newMemberUnread.get(conversationId) ?? 0, input.userId),
	);

	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Removes one member from a group conversation — by someone else (a kick) or
 * by themselves (leaving). The two are the same operation: whoever is acting
 * must already be a participant either way, and the row that gets deleted is
 * the same row regardless of who asked.
 *
 * No HTTP response body: the actor and the target learn what happened from
 * socket events (`conversation:updated`, `conversation:left`), the same
 * write-over-HTTP-render-over-socket split the rest of the app already uses.
 *
 * The group is allowed to end up with zero participants. Nothing deletes a
 * conversation in this app — an empty group just becomes unreachable, the
 * same way a direct conversation is never destroyed either.
 *
 * Removing yourself is always allowed. Any admin may remove anyone else,
 * including another admin — symmetric among admins, see ADR 0021.
 */
export async function removeParticipant(
	currentUserId: string,
	conversationId: string,
	targetUserId: string,
): Promise<void> {
	const isLeaving = targetUserId === currentUserId;
	const { systemMessages, remaining } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);

		const target = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
			select: { id: true, role: true, user: { select: { displayName: true } } },
		});
		if (!target) throw new NotFoundError("Not a participant of this conversation");
		if (!isLeaving) {
			await assertAdmin(transaction, currentUserId, conversationId);
		}

		await transaction.conversationParticipant.delete({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
		});

		const messages: MessageRow[] = [];
		if (isLeaving) {
			messages.push(
				await createSystemMessage(transaction, conversationId, `${target.user.displayName} left the group`),
			);
		} else {
			const [actorName] = await displayNamesOf(transaction, [currentUserId]);
			messages.push(
				await createSystemMessage(
					transaction,
					conversationId,
					`${actorName} removed ${target.user.displayName}`,
				),
			);
		}

		// After the departure line, so the persisted log reads in the order the
		// transition happened. Both writes still commit or roll back together.
		if (target.role === "ADMIN") {
			const successionMessage = await promoteNextAdmin(transaction, conversationId);
			if (successionMessage) messages.push(successionMessage);
		}

		return {
			systemMessages: messages,
			remaining: await reloadConversation(transaction, conversationId),
		};
	});

	// Socket effects follow the commit. Eviction still comes before broadcasts,
	// so the removed user cannot receive the system lines about their departure.
	await evictParticipantFromRoom(targetUserId, conversationId);
	announceParticipantLeft(targetUserId, conversationId);
	for (const message of systemMessages) announceSystemMessage(message);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(remaining));
}

/** Renames a group conversation. Any admin may — day-to-day group maintenance. */
export async function renameConversation(
	currentUserId: string,
	conversationId: string,
	input: RenameConversationInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertAdmin(transaction, currentUserId, conversationId);

		// `@updatedAt` bumps `Conversation.updatedAt` on this write, which moves the
		// conversation to the top of everyone's sidebar (sorted by that column).
		await transaction.conversation.update({
			where: { id: conversationId },
			data: { name: input.name },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			`${actorName} renamed the group to "${input.name}"`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	announceSystemMessage(systemMessage);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Promotes a member to admin or demotes an admin to member. Any admin may act
 * on any other participant, including another admin — symmetric, see ADR 0021.
 *
 * Demoting the group's last admin auto-promotes the next longest-standing
 * member in the same transaction, the same succession `removeParticipant` uses
 * — a group is never left without one.
 */
export async function setParticipantRole(
	currentUserId: string,
	conversationId: string,
	targetUserId: string,
	input: SetParticipantRoleInput,
): Promise<ConversationDTO> {
	const { systemMessages, updated, didChange } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertAdmin(transaction, currentUserId, conversationId);

		const target = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
			select: { id: true, role: true, user: { select: { displayName: true } } },
		});
		if (!target) throw new NotFoundError("Not a participant of this conversation");

		const nextRole = input.role === "admin" ? "ADMIN" : "MEMBER";
		if (target.role === nextRole) {
			return {
				systemMessages: [],
				updated: await reloadConversation(transaction, conversationId),
				didChange: false,
			};
		}

		await transaction.conversationParticipant.update({
			where: { id: target.id },
			data: { role: nextRole },
			select: { id: true },
		});
		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const action = nextRole === "ADMIN" ? "made" : "removed";
		const suffix = nextRole === "ADMIN" ? "an admin" : "from the admins";
		const messages = [
			await createSystemMessage(
				transaction,
				conversationId,
				`${actorName} ${action} ${target.user.displayName} ${suffix}`,
			),
		];

		if (nextRole === "MEMBER") {
			const successionMessage = await promoteNextAdmin(transaction, conversationId);
			if (successionMessage) messages.push(successionMessage);
		}

		return {
			systemMessages: messages,
			updated: await reloadConversation(transaction, conversationId),
			didChange: true,
		};
	});

	if (didChange) {
		for (const message of systemMessages) announceSystemMessage(message);
		announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	}
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/** Replaces the group's invite policy. Any admin may choose who may grow it. */
export async function setGroupInvitePolicy(
	currentUserId: string,
	conversationId: string,
	input: SetInvitePolicyInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated, didChange } = await prisma.$transaction(async (transaction) => {
		const group = await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertAdmin(transaction, currentUserId, conversationId);
		const nextPolicy = input.invitePolicy === "managers" ? "MANAGERS" : "EVERYONE";
		if (group.invitePolicy === nextPolicy) {
			return {
				systemMessage: null,
				updated: await reloadConversation(transaction, conversationId),
				didChange: false,
			};
		}

		await transaction.conversation.update({
			where: { id: conversationId },
			data: { invitePolicy: nextPolicy },
			select: { id: true },
		});
		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const description = nextPolicy === "MANAGERS" ? "admins" : "everyone";
		const message = await createSystemMessage(
			transaction,
			conversationId,
			`${actorName} changed group invites to ${description}`,
		);

		return {
			systemMessage: message,
			updated: await reloadConversation(transaction, conversationId),
			didChange: true,
		};
	});

	if (didChange) {
		if (systemMessage) announceSystemMessage(systemMessage);
		announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));
	}
	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);

	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Takes a user out of every conversation they are in, inside the caller's transaction.
 *
 * The conversation-shaped half of deleting an account. It lives here rather than
 * in `users.service` because it is made entirely of this module's invariants —
 * the admin-succession rule, the system log, the room bookkeeping — and none of
 * them should be reimplemented by whoever happens to be deleting the row.
 *
 * Takes the transaction rather than opening one, so the departures and the delete
 * of the user itself are one commit. Half of this having happened is a person who
 * has left four groups and still has an account.
 *
 * Direct conversations are left alone: there is nobody to promote and nothing to
 * announce, and the participant row goes with the user by cascade. The messages
 * stay in both cases — see the `Message.authorId` schema comment.
 *
 * Returns what has to be broadcast *after* the commit, because a socket event is
 * not transactional and an event about a transaction that rolls back is a lie.
 */
export interface DepartureEffects {
	systemMessages: MessageRow[];
	conversations: ConversationRow[];
}

export async function removeUserFromEveryGroup(
	transaction: Prisma.TransactionClient,
	userId: string,
	displayName: string,
): Promise<DepartureEffects> {
	const memberships = await transaction.conversationParticipant.findMany({
		where: { userId, conversation: { isGroup: true } },
		// Forwarding also locks multiple conversations in this database order.
		orderBy: { conversationId: "asc" },
		select: { conversationId: true, role: true },
	});

	const systemMessages: MessageRow[] = [];
	const conversations: ConversationRow[] = [];

	for (const membership of memberships) {
		const { conversationId } = membership;
		// The same row lock every other membership change takes, so a deletion and
		// a concurrent kick or hand-over on the same group happen in one order.
		await transaction.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;

		await transaction.conversationParticipant.delete({
			where: { conversationId_userId: { conversationId, userId } },
		});

		// The name is captured before the row goes, and it is the last time this
		// person is named anywhere: their surviving messages lose the author
		// entirely. A group that watched somebody vanish with no line in the log
		// would be the one membership change ADR 0009 does not record.
		systemMessages.push(
			await createSystemMessage(transaction, conversationId, `${displayName} deleted their account`),
		);

		if (membership.role === "ADMIN") {
			const successionMessage = await promoteNextAdmin(transaction, conversationId);
			if (successionMessage) systemMessages.push(successionMessage);
		}

		conversations.push(await reloadConversation(transaction, conversationId));
	}

	return { systemMessages, conversations };
}

/** Broadcasts what `removeUserFromEveryGroup` did, once its transaction has committed. */
export function announceDepartures(effects: DepartureEffects): void {
	for (const message of effects.systemMessages) announceSystemMessage(message);
	for (const conversation of effects.conversations) {
		announceConversationUpdated(conversation.id, toConversationUpdatedEvent(conversation));
	}
}
