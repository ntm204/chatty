import type { RestrictedUsersPageDTO, RestrictionStatusDTO } from "@chatty/shared-types";
// A value import, not `import type`: `excludeRestrictedDirectRoomIds` calls
// `Prisma.join` to build the room-id list's raw-SQL `IN (...)`.
import { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { ListRestrictedUsersQuery } from "./restrictions.schema.js";

type RestrictionReader = Pick<Prisma.TransactionClient, "userRestriction">;

/**
 * Restricting, and the two things it changes.
 *
 * A block refuses the write. A restriction refuses **nothing** — the message is
 * written, delivered and readable, in the same conversation it always was — and
 * instead changes what it reveals: in the direct conversation it stops counting
 * towards the restrictor's unread badge (see `countUnreadByConversation` in
 * `conversations.service.ts`; shared groups still count),
 * and this person stops seeing the restrictor's read receipts
 * (`markConversationRead`) and presence (`sockets/presence.ts`).
 *
 * A dedicated "Message requests" mailbox — moving the conversation itself
 * somewhere else, the way Instagram/Messenger do — is deliberately not part of
 * this: it needs its own schema state and its own inbox view, not just a filter
 * on data that already exists. Left as a follow-up, not implied by anything here.
 *
 * The row is directed and, unlike a block, so is every effect. That asymmetry is
 * the feature: a block is a wall between two people, while a restriction is
 * something one person does to their own inbox. Restricting somebody does not
 * take away *your* view of them, which is why you can still read the thread and
 * still see when they are online.
 *
 * Nobody is told. That is the whole difference from blocking as far as the other
 * person can observe, and it is why none of the enforcement below may ever
 * produce an error a sender could tell apart from an ordinary success.
 */
export async function restrictUser(currentUserId: string, targetUserId: string): Promise<void> {
	if (currentUserId === targetUserId) throw new ValidationError("You cannot restrict yourself");

	await prisma.$transaction(async (transaction) => {
		const target = await transaction.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
		if (!target) throw new NotFoundError("User not found");

		// Restricting twice is not an error anybody should have to handle, and the
		// unique index is what lets this say so in one statement rather than a
		// read-then-write that two tabs could both pass.
		await transaction.userRestriction.upsert({
			where: {
				restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: targetUserId },
			},
			create: { restrictorId: currentUserId, restrictedId: targetUserId },
			update: {},
			select: { id: true },
		});
	});

	announceToOwnSessions(currentUserId, targetUserId, true);
}

/** Removes the caller's own restriction. Unrestricting someone who is not restricted is a no-op. */
export async function unrestrictUser(currentUserId: string, targetUserId: string): Promise<void> {
	await prisma.userRestriction.deleteMany({
		where: { restrictorId: currentUserId, restrictedId: targetUserId },
	});

	announceToOwnSessions(currentUserId, targetUserId, false);
}

/**
 * Tells the actor's other tabs and devices, and nobody else at all.
 *
 * The same rule `block:changed` follows and for a stronger reason: a block is
 * observable to the person blocked the moment they try to send, while a
 * restriction is designed to be unobservable. An event reaching the restricted
 * person would be the only way they could ever find out, and its *arrival* would
 * say it even with an empty payload.
 *
 * Best-effort: the row is already committed, and an API that answered 500 here
 * would tell the caller nothing changed when the database says otherwise.
 */
function announceToOwnSessions(actorUserId: string, otherUserId: string, isRestricted: boolean): void {
	getOptionalIO()?.to(userRoom(actorUserId)).emit("restriction:changed", { userId: otherUserId, isRestricted });
}

/** A cursor page for the privacy settings, never an unbounded account-sized list. */
export async function listRestrictedUsers(
	currentUserId: string,
	query: ListRestrictedUsersQuery,
): Promise<RestrictedUsersPageDTO> {
	const cursor = query.before
		? await prisma.userRestriction.findFirst({
				where: { id: query.before, restrictorId: currentUserId },
				select: { id: true, createdAt: true },
			})
		: null;
	if (query.before && !cursor) throw new NotFoundError("Restricted user not found");

	const restrictions = await prisma.userRestriction.findMany({
		where: {
			restrictorId: currentUserId,
			...(cursor
				? {
						OR: [
							{ createdAt: { lt: cursor.createdAt } },
							{ createdAt: cursor.createdAt, id: { lt: cursor.id } },
						],
					}
				: {}),
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit + 1,
		select: { id: true, restricted: { select: userSelect } },
	});
	const items = restrictions.slice(0, query.limit);

	return {
		items: items.map((restriction) => toUserDTO(restriction.restricted)),
		nextCursor: restrictions.length > query.limit ? (items.at(-1)?.id ?? null) : null,
	};
}

/**
 * The only restriction fact a caller may ask about: whether they restricted this
 * user.
 *
 * Answering the reverse would hand the restricted person the one thing the
 * feature exists to withhold. A missing target is deliberately false too, so
 * probing arbitrary ids reveals no account information.
 */
export async function getRestrictionStatus(currentUserId: string, targetUserId: string): Promise<RestrictionStatusDTO> {
	const restriction = await prisma.userRestriction.findUnique({
		where: { restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: targetUserId } },
		select: { id: true },
	});

	return { isRestricted: restriction !== null };
}

/**
 * Whether `currentUserId` has restricted the other person.
 *
 * One direction only, and every caller wants this one: it is the question
 * "should something of mine be withheld from them", asked by the read-receipt
 * and presence paths about the person whose data is about to travel.
 */
export async function hasRestricted(
	currentUserId: string,
	otherUserId: string,
	database: RestrictionReader = prisma,
): Promise<boolean> {
	const restriction = await database.userRestriction.findUnique({
		where: { restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: otherUserId } },
		select: { id: true },
	});

	return restriction !== null;
}

/** The peer of a direct conversation, or null for a group or a missing room. */
async function findDirectPeerId(
	currentUserId: string,
	conversationId: string,
	database: Pick<Prisma.TransactionClient, "conversation"> = prisma,
): Promise<string | null> {
	const conversation = await database.conversation.findUnique({
		where: { id: conversationId },
		select: { isGroup: true, participants: { select: { userId: true } } },
	});
	if (!conversation || conversation.isGroup) return null;

	return conversation.participants.find((participant) => participant.userId !== currentUserId)?.userId ?? null;
}

/**
 * Whether this direct conversation is one the caller has restricted.
 *
 * Groups are exempt for the same reason they are exempt from blocking: a room
 * several people share is not a relationship one of them gets to redefine, and
 * hiding one member's messages there makes unread counts and read markers
 * resolve differently for two people reading one thread.
 */
export async function isDirectConversationRestricted(
	currentUserId: string,
	conversationId: string,
	database: Pick<Prisma.TransactionClient, "conversation" | "userRestriction"> = prisma,
): Promise<boolean> {
	const otherUserId = await findDirectPeerId(currentUserId, conversationId, database);

	return otherUserId ? hasRestricted(currentUserId, otherUserId, database) : false;
}

/**
 * Which of `roomIds` are direct conversations `currentUserId` should not
 * broadcast presence into, because they restricted the other side.
 *
 * Presence goes out room-by-room (see `sockets/presence.ts`), and a direct
 * conversation's room has exactly two members — the restrictor and the person
 * they restricted — so withholding a room from the broadcast list withholds it
 * from exactly the one audience the restriction is about. Bulk rather than one
 * `isDirectConversationRestricted` call per room: presence fires on every
 * connect and disconnect, and that is the wrong place for a query per
 * conversation someone happens to be in.
 */
export async function excludeRestrictedDirectRoomIds(currentUserId: string, roomIds: string[]): Promise<string[]> {
	if (roomIds.length === 0) return roomIds;

	const restricted = await prisma.$queryRaw<{ conversationId: string }[]>`
		SELECT DISTINCT cp."conversationId"
		FROM "ConversationParticipant" cp
		JOIN "Conversation" c ON c.id = cp."conversationId"
		JOIN "UserRestriction" r ON r."restrictorId" = ${currentUserId} AND r."restrictedId" = cp."userId"
		WHERE c."isGroup" = false
			AND cp."conversationId" IN (${Prisma.join(roomIds)})
			AND cp."userId" IS DISTINCT FROM ${currentUserId}
	`;
	const restrictedRoomIds = new Set(restricted.map((row) => row.conversationId));

	return roomIds.filter((roomId) => !restrictedRoomIds.has(roomId));
}

/**
 * Which of `candidateUserIds` have restricted `currentUserId`.
 *
 * The other half of presence hiding: `excludeRestrictedDirectRoomIds` stops a
 * restrictor's own presence changes from reaching the person they restricted,
 * but a freshly connected socket also asks once, up front, "who among my
 * contacts is already online" (`announceConnected`'s snapshot). That list has
 * to apply the same rule from the opposite side, or restricting someone would
 * only hide the *next* update and not the picture they already have.
 */
export async function listRestrictorsAmong(currentUserId: string, candidateUserIds: string[]): Promise<Set<string>> {
	if (candidateUserIds.length === 0) return new Set();

	const rows = await prisma.userRestriction.findMany({
		where: { restrictedId: currentUserId, restrictorId: { in: candidateUserIds } },
		select: { restrictorId: true },
	});

	return new Set(rows.map((row) => row.restrictorId));
}
