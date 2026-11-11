/**
 * Internals every `conversations.*.service.ts` shares: the membership and admin
 * guards, the per-viewer unread count, the group-mutation lock, the system-log
 * writer and the socket-room bookkeeping. Not re-exported by
 * `conversations.service.ts` except `assertParticipant`, which other modules use.
 */
import type { ConversationDTO, ConversationUpdatedEvent } from "@chatty/shared-types";
import { Prisma, type ConversationInvitePolicy as DbConversationInvitePolicy } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { messageSelect, toMessageDTO, type MessageRow } from "../messages/messages.mapper.js";
import { conversationInclude, type ConversationRow } from "./conversations.mapper.js";

interface UnreadCountRow {
	conversationId: string;
	unreadCount: number;
}

/**
 * How many messages the user has not read, per conversation.
 *
 * Raw SQL, and the reason is that every conversation has a *different*
 * boundary: the count runs from wherever that participant's marker sits.
 * Prisma's `groupBy` can count rows per conversation but cannot join each group
 * against its own cursor row, so expressing this through the query builder
 * means one query per conversation — a sidebar of thirty threads becoming
 * thirty round trips on every refresh.
 *
 * A conversation with nothing unread produces no row at all (there is nothing
 * to group), which is why callers default a miss to zero rather than trusting
 * the map to be complete.
 *
 * System messages are never counted — a badge on the sidebar means "someone said
 * something to you", and "Chi left the group" is not that. It used to fall out of
 * the SQL for free, because `authorId` was null only on a system line and
 * `null <> $userId` is null rather than true. Deleting an account ended that: a
 * USER message can now outlive its author and have a null `authorId` too, and
 * reading it as a system line would quietly stop counting the messages of
 * everyone who ever left. `kind` is the discriminator, so the filter says so.
 *
 * Deleted messages are not counted either, and that one *is* special-cased.
 * A tombstone has no content left to read, so a badge pointing at it sends
 * someone to look at "This message was deleted". The row still has to be here
 * for the marker join below — which is the whole reason a delete is a tombstone
 * rather than a DELETE.
 *
 * **Unread starts when you joined, not when the conversation did.** Without the
 * `joinedAt` bound, being added to a group with five years of history lit the
 * badge with all of it: a new participant's marker is null, and a null marker
 * means "has read nothing", which is true and useless. It is bounded for
 * everyone rather than only for new joiners, because that is one rule instead of
 * two — for the people who were there at the start `joinedAt` is the moment the
 * conversation was created, so nothing predates it and nothing changes.
 *
 * A restriction only quiets the direct conversation. In a shared group the
 * restricted person's messages still count: the menu promises "Shared groups are
 * not affected", and popups/sounds already followed that rule — counting the
 * badge differently made it disagree with the alert for the same message.
 *
 * `>=`, not `>`, and it is not an off-by-one. Both columns are millisecond
 * timestamps written by the application, so a message sent in the same
 * millisecond as somebody joining is a genuine tie — and it is a tie in tests
 * constantly, where a fixture creates a conversation and sends into it in one
 * breath. Counting that message is the friendlier way to be wrong: the reader
 * sees something they may already have known about, rather than never being told
 * about a message at all.
 */
export async function countUnreadByConversation(
	userId: string,
	conversationIds: string[],
): Promise<Map<string, number>> {
	if (conversationIds.length === 0) return new Map();

	const rows = await prisma.$queryRaw<UnreadCountRow[]>`
		SELECT m."conversationId", COUNT(*)::int AS "unreadCount"
		FROM "Message" m
		JOIN "ConversationParticipant" p
			ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
		JOIN "Conversation" conversation ON conversation.id = m."conversationId"
		LEFT JOIN "Message" marker ON marker.id = p."lastReadMessageId"
		WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
			AND m."kind" = 'USER'
			AND m."authorId" IS DISTINCT FROM ${userId}
			AND m."deletedAt" IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM "MessageHiddenFor" h
				WHERE h."messageId" = m.id AND h."userId" = ${userId}
			)
			AND (
				conversation."isGroup"
				OR NOT EXISTS (
					SELECT 1 FROM "UserRestriction" r
					WHERE r."restrictorId" = ${userId} AND r."restrictedId" = m."authorId"
				)
			)
			AND m."createdAt" >= p."joinedAt"
			AND (marker.id IS NULL OR (m."createdAt", m.id) > (marker."createdAt", marker.id))
		GROUP BY m."conversationId"
	`;

	return new Map(rows.map((row) => [row.conversationId, row.unreadCount]));
}

/**
 * Throws unless `userId` is a participant of `conversationId`.
 *
 * Lives here, in the module that owns participants, and is imported by every
 * other module that touches a conversation — messages, and the socket layer.
 * Not middleware: services are reachable from HTTP *and* from socket handlers,
 * so a check in Express middleware is a check the socket transport skips.
 *
 * NotFoundError, not UnauthorizedError: "you may not see this" confirms the
 * conversation exists, which lets an outsider probe for valid ids.
 */
type ParticipantReader = Pick<Prisma.TransactionClient, "conversationParticipant">;

export async function assertParticipant(
	userId: string,
	conversationId: string,
	database: ParticipantReader = prisma,
): Promise<void> {
	const participant = await database.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId } },
		select: { id: true },
	});

	if (!participant) throw new NotFoundError("Conversation not found");
}

/**
 * Adds every participant's already-connected sockets to the new conversation's room.
 *
 * Sockets join their conversation rooms once, at connect time. Without this,
 * someone who was already online when the conversation was created would sit in
 * a chat that never updates until they reload — the message is broadcast to a
 * room they are not in yet.
 *
 * Addressed via each user's personal room, so every tab and device they have
 * open is covered, not just the most recent one.
 */
export async function subscribeParticipantsToRoom(participantIds: string[], conversationId: string): Promise<void> {
	const io = getIO();

	await Promise.all(participantIds.map((userId) => io.in(userRoom(userId)).socketsJoin(conversationId)));
}

/**
 * Tells every participant that a conversation now exists.
 *
 * Joining the room (above) only decides where future messages land. A new
 * conversation has none, so without this event it would stay invisible in the
 * sidebar until someone sent the first message — or until a reload.
 *
 * Addressed per user rather than to the conversation room so it reaches every
 * device they have open, including ones that just joined the room.
 *
 * One payload for everyone, including its per-viewer `unreadCount` — sound only
 * because a conversation this new has no messages, so that number is zero for
 * all of them. Anything sent here later that differs per participant would have
 * to be built per participant.
 */
export function announceNewConversation(participantIds: string[], conversation: ConversationDTO): void {
	const io = getIO();

	for (const userId of participantIds) {
		io.to(userRoom(userId)).emit("conversation:new", conversation);
	}
}

/**
 * Tells whoever is still in a conversation that shared membership or settings changed.
 *
 * To the conversation room, not per-user like `conversation:new` — everyone
 * left in it should see the same membership and policy, and by the time this fires
 * a removed participant's sockets have already been evicted from that room
 * (see `evictParticipantFromRoom`), so they do not receive it.
 */
export function announceConversationUpdated(conversationId: string, event: ConversationUpdatedEvent): void {
	getIO().to(conversationId).emit("conversation:updated", event);
}

/**
 * Serialises a group mutation, then confirms its actor and target kind.
 *
 * Shared by every group-only operation in this module (add, remove, rename,
 * roles, invite policy, photo). A direct conversation always has exactly its
 * original two participants — the schema
 * comment on `Conversation.isGroup` already explains why that has to stay true
 * by construction: deriving it from a headcount instead would let a direct
 * chat that gained a third member silently become a group.
 *
 * Membership is checked only after the lock, so a concurrent leave cannot pass
 * authorization against a row that disappears before the write.
 */
export async function prepareGroupMutation(
	transaction: Prisma.TransactionClient,
	userId: string,
	conversationId: string,
): Promise<{ invitePolicy: DbConversationInvitePolicy }> {
	// Every membership or name mutation takes the same row lock first. It makes
	// two requests for one group happen in a stable order — most importantly the
	// last admin leaving at the same time as their likely successor. Without it,
	// one request can promote a participant the other request has just removed.
	const conversations = await transaction.$queryRaw<{ isGroup: boolean; invitePolicy: DbConversationInvitePolicy }[]>`
		SELECT "isGroup", "invitePolicy"
		FROM "Conversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;

	await assertParticipant(userId, conversationId, transaction);

	if (!conversations[0]?.isGroup) {
		throw new ValidationError("This operation is only available in a group conversation");
	}

	return { invitePolicy: conversations[0].invitePolicy };
}

/**
 * Throws unless `userId` is an admin of `conversationId`.
 *
 * Guards every operation that acts on *other* people or on the group itself —
 * renaming it, removing someone, changing roles or invite policy. Leaving is
 * deliberately not one of them: it acts on yourself, and a group whose admins
 * could trap people in it would be a worse answer than an adminless one.
 *
 * Symmetric among admins on purpose (ADR 0021): there is no senior admin, so
 * this is the only gate any of those operations needs.
 *
 * ForbiddenError, not NotFoundError: unlike `assertParticipant`, the caller is
 * already known to be in this conversation, so there is nothing left to hide by
 * pretending it does not exist — and a 404 would leave the UI unable to explain
 * why the button did nothing.
 */
export async function assertAdmin(
	transaction: Prisma.TransactionClient,
	userId: string,
	conversationId: string,
): Promise<void> {
	const participant = await transaction.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId } },
		select: { role: true },
	});

	if (participant?.role !== "ADMIN") throw new ForbiddenError("Only group admins can do this");
}

/**
 * The display names behind a list of user ids, in the order they were asked for.
 *
 * One query for however many names a sentence needs, and positional so the
 * caller can destructure it — `const [actorName, targetName] = ...` reads as
 * the sentence it is about to build.
 *
 * A missing id falls back to "Someone" rather than throwing. Nothing deletes
 * users today, so this is unreachable; the day something does, a group log that
 * says "Someone added Binh" is a better outcome than an add that fails at the
 * last step with the row already written.
 */
export async function displayNamesOf(transaction: Prisma.TransactionClient, userIds: string[]): Promise<string[]> {
	const users = await transaction.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, displayName: true },
	});
	const byId = new Map(users.map((user) => [user.id, user.displayName]));

	return userIds.map((userId) => byId.get(userId) ?? "Someone");
}

/**
 * Writes one "An added Binh" line inside the caller's transaction.
 *
 * A real Message row, not a client-side annotation on `conversation:updated`:
 * it has to survive a reload, sit in order among the messages around it, and
 * still be there when someone scrolls back a week. The sentence is rendered
 * here, once, and stored — see ADR 0009 for why it is a snapshot of the names
 * rather than ids resolved at read time.
 *
 * Written here rather than by calling `messages.service`, which is
 * where a message-sending function would otherwise belong: that module already
 * imports `assertParticipant` from this one, and importing it back would close
 * the cycle `messages.mapper` exists to keep open.
 */
export async function createSystemMessage(
	transaction: Prisma.TransactionClient,
	conversationId: string,
	content: string,
): Promise<MessageRow> {
	const message = await transaction.message.create({
		data: { conversationId, kind: "SYSTEM", content },
		select: messageSelect,
	});

	// Same transaction, and the same reason `sendMessage` uses one: a
	// conversation whose `updatedAt` disagrees with its newest message sorts
	// wrongly in every sidebar from then on.
	await transaction.conversation.update({
		where: { id: conversationId },
		data: { updatedAt: new Date() },
		select: { id: true },
	});

	return message;
}

/** Socket effects happen only after the database transaction has committed. */
export function announceSystemMessage(message: MessageRow): void {
	getIO().to(message.conversationId).emit("message:new", toMessageDTO(message));
}

/** Re-reads a conversation after a write, for the two shapes callers need from it. */
export async function reloadConversation(
	transaction: Prisma.TransactionClient,
	conversationId: string,
): Promise<ConversationRow> {
	return transaction.conversation.findUniqueOrThrow({
		where: { id: conversationId },
		include: conversationInclude,
	});
}
