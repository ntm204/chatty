import type { BlockStatusDTO, BlockedUsersPageDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { ListBlockedUsersQuery } from "./blocks.schema.js";
import { severRelationships } from "../friends/friends.service.js";

type BlockReader = Pick<Prisma.TransactionClient, "userBlock">;

type AdvisoryLockClient = Pick<Prisma.TransactionClient, "$executeRaw">;

type DirectConversationPolicyReader = Pick<Prisma.TransactionClient, "$executeRaw" | "conversation" | "userBlock">;

/**
 * Serializes changes and direct writes for one pair of people across processes.
 *
 * A conversation-row lock cannot order a new block, because the block lives in
 * a different table and may not exist yet. PostgreSQL advisory locks are scoped
 * to the transaction and work on every API instance, so a send and a block of
 * the same pair always observe one committed order without creating a permanent
 * lock row just to protect the absent-row case.
 */
export async function lockDirectContactPair(
	database: AdvisoryLockClient,
	firstUserId: string,
	secondUserId: string,
): Promise<void> {
	const pairKey = [firstUserId, secondUserId].sort().join(":");
	// `$executeRaw`, not `$queryRaw`, and this is not a style choice:
	// `pg_advisory_xact_lock` returns `void`, and Prisma's row deserializer has no
	// mapping for a void column — every call through `$queryRaw` failed with
	// "Failed to deserialize column of type 'void'", which took every direct send
	// and every direct conversation creation down with it. Nothing that mocks the
	// database can see that; only a real Postgres can.
	await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pairKey}, 0))`;
}

/**
 * Checks the durable policy while holding the pair lock in the caller's transaction.
 *
 * This is the policy boundary for any direct-conversation write whose result
 * another person could eventually see. The transaction requirement is not an
 * implementation detail: an advisory *transaction* lock cannot order a later
 * write if it is acquired on the global pooled client and released immediately.
 */
export async function assertDirectContactAvailable(
	currentUserId: string,
	otherUserId: string,
	database: DirectConversationPolicyReader,
): Promise<void> {
	await lockDirectContactPair(database, currentUserId, otherUserId);
	await assertNotBlocked(currentUserId, otherUserId, database);
}

async function hasBlockBetween(
	firstUserId: string,
	secondUserId: string,
	database: BlockReader = prisma,
): Promise<boolean> {
	const block = await database.userBlock.findFirst({
		where: {
			OR: [
				{ blockerId: firstUserId, blockedId: secondUserId },
				{ blockerId: secondUserId, blockedId: firstUserId },
			],
		},
		select: { id: true },
	});

	return block !== null;
}

/** Every existing direct room for the pair, including historical duplicates. */
async function listDirectConversationIds(
	firstUserId: string,
	secondUserId: string,
	database: Pick<Prisma.TransactionClient, "conversation"> = prisma,
): Promise<string[]> {
	const candidates = await database.conversation.findMany({
		where: {
			isGroup: false,
			AND: [
				{ participants: { some: { userId: firstUserId } } },
				{ participants: { some: { userId: secondUserId } } },
			],
		},
		select: { id: true, _count: { select: { participants: true } } },
	});

	return candidates
		.filter((conversation) => conversation._count.participants === 2)
		.map((conversation) => conversation.id);
}

/** A group remains a deliberate shared context even when its members block in DM. */
async function shareGroupConversation(
	firstUserId: string,
	secondUserId: string,
	database: Pick<Prisma.TransactionClient, "conversation"> = prisma,
): Promise<boolean> {
	const group = await database.conversation.findFirst({
		where: {
			isGroup: true,
			AND: [
				{ participants: { some: { userId: firstUserId } } },
				{ participants: { some: { userId: secondUserId } } },
			],
		},
		select: { id: true },
	});

	return group !== null;
}

/**
 * Reconciles the ephemeral transport with the committed privacy policy.
 *
 * Room membership is an optimisation, not authorization — HTTP and socket
 * handlers still check the database — but removing these rooms promptly stops
 * presence, typing, read receipts and old-message updates from crossing a
 * blocked direct conversation. Joining after the final block is removed makes
 * an existing conversation live again without a reconnect.
 *
 * `actorUserId` is the person who pressed the button, and the asymmetry matters:
 * the room reconciliation and the presence withdrawal are symmetric facts about
 * the pair, while `block:changed` is one person's own directed row and goes to
 * their room alone. See `BlockChangedEvent`.
 */
async function syncDirectConversationRooms(actorUserId: string, otherUserId: string): Promise<void> {
	const io = getOptionalIO();
	if (!io) return;

	try {
		await prisma.$transaction(async (transaction) => {
			// A block and an unblock can both commit before either reaches Socket.io.
			// Re-reading and reconciling while holding the same pair lock makes the
			// final room state follow the last committed policy, not whichever adapter
			// call happens to finish last.
			await lockDirectContactPair(transaction, actorUserId, otherUserId);
			const isBlocked = await hasBlockBetween(actorUserId, otherUserId, transaction);

			// Read under the same lock, and separately from `isBlocked`: what the
			// actor's own tabs need is their *own* row, not the symmetric fact. Two
			// tabs racing a block and an unblock therefore settle on the last
			// committed state rather than on whichever emit lands second.
			const ownBlock = await transaction.userBlock.findUnique({
				where: { blockerId_blockedId: { blockerId: actorUserId, blockedId: otherUserId } },
				select: { id: true },
			});
			// Before the early return below: unblocking from account settings is
			// ordinary, and there may be no direct conversation left to reconcile.
			io.to(userRoom(actorUserId)).emit("block:changed", {
				userId: otherUserId,
				isBlocked: ownBlock !== null,
			});

			const conversationIds = await listDirectConversationIds(actorUserId, otherUserId, transaction);
			const sharesGroup = isBlocked && (await shareGroupConversation(actorUserId, otherUserId, transaction));
			if (conversationIds.length === 0) return;

			await Promise.all(
				conversationIds.flatMap((conversationId) =>
					[actorUserId, otherUserId].map((userId) =>
						isBlocked
							? io.in(userRoom(userId)).socketsLeave(conversationId)
							: io.in(userRoom(userId)).socketsJoin(conversationId),
					),
				),
			);

			if (isBlocked && !sharesGroup) {
				// `onlineUserIds` is global in the web client. Clearing it here is
				// correct only when no shared group remains to make presence visible;
				// otherwise a direct block would incorrectly hide legitimate group
				// presence too. The null marker also clears a stale last-seen value.
				io.to(userRoom(actorUserId)).emit("presence:update", {
					userId: otherUserId,
					isOnline: false,
					lastSeenAt: null,
				});
				io.to(userRoom(otherUserId)).emit("presence:update", {
					userId: actorUserId,
					isOnline: false,
					lastSeenAt: null,
				});
			}
		});
	} catch (error) {
		// The policy was already committed before this best-effort delivery work.
		// Refusing its API request now would tell the caller nothing changed when
		// the database says the opposite. Reconnects always rebuild rooms from the
		// durable policy, and direct socket writes re-check it until then.
		logger.error({ err: error, actorUserId, otherUserId }, "failed to reconcile blocked direct rooms");
	}
}

/**
 * Blocking, and the one question every direct write has to ask first.
 *
 * The row is directed — it records who did it — but the *effect* is symmetric:
 * neither person can send to the other, and neither appears in the other's
 * search. That asymmetry between storage and behaviour is deliberate. Two rows
 * would make "who blocked whom" unanswerable, and only the blocker's own row can
 * be removed; the blocked person unblocking themselves is not a thing.
 *
 * Groups are untouched, which is the same answer WhatsApp, Messenger and
 * Telegram give. Hiding a blocked person's messages inside a room both people
 * are in is Discord's answer, and it makes paging, unread counts and read
 * markers resolve differently for two people reading one thread.
 */
export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
	if (currentUserId === targetUserId) throw new ValidationError("You cannot block yourself");

	await prisma.$transaction(async (transaction) => {
		await lockDirectContactPair(transaction, currentUserId, targetUserId);
		const target = await transaction.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
		if (!target) throw new NotFoundError("User not found");

		// Blocking twice is not an error anybody should have to handle, and the
		// unique index is what lets this say so in one statement rather than a
		// read-then-write that two tabs could both pass.
		await transaction.userBlock.upsert({
			where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: targetUserId } },
			create: { blockerId: currentUserId, blockedId: targetUserId },
			update: {},
			select: { id: true },
		});
		// A block ends any friendship, request or follow between the two, as on Facebook.
		await severRelationships(transaction, currentUserId, targetUserId);
	});

	await syncDirectConversationRooms(currentUserId, targetUserId);
}

/** Removes the caller's own block. Unblocking someone who is not blocked is a no-op. */
export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
	await prisma.$transaction(async (transaction) => {
		await lockDirectContactPair(transaction, currentUserId, targetUserId);
		await transaction.userBlock.deleteMany({ where: { blockerId: currentUserId, blockedId: targetUserId } });
	});

	await syncDirectConversationRooms(currentUserId, targetUserId);
}

/** A cursor page for the privacy settings, never an unbounded account-sized list. */
export async function listBlockedUsers(
	currentUserId: string,
	query: ListBlockedUsersQuery,
): Promise<BlockedUsersPageDTO> {
	const cursor = query.before
		? await prisma.userBlock.findFirst({
				where: { id: query.before, blockerId: currentUserId },
				select: { id: true, createdAt: true },
			})
		: null;
	if (query.before && !cursor) throw new NotFoundError("Blocked user not found");

	const blocks = await prisma.userBlock.findMany({
		where: {
			blockerId: currentUserId,
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
		select: { id: true, blocked: { select: userSelect } },
	});
	const items = blocks.slice(0, query.limit);

	return {
		items: items.map((block) => toUserDTO(block.blocked)),
		nextCursor: blocks.length > query.limit ? (items.at(-1)?.id ?? null) : null,
	};
}

/**
 * The only block fact a caller may ask about: whether they blocked this user.
 *
 * Returning the reverse direction would turn this endpoint into a reliable
 * "have they blocked me?" oracle. A missing target is deliberately false too,
 * so probing arbitrary ids reveals no account information.
 */
export async function getBlockStatus(currentUserId: string, targetUserId: string): Promise<BlockStatusDTO> {
	const block = await prisma.userBlock.findUnique({
		where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: targetUserId } },
		select: { id: true },
	});

	return { isBlocked: block !== null };
}

/**
 * Refuses a direct write when either person has blocked the other.
 *
 * Deliberately says the same thing whichever way the block runs. Telling a
 * sender "they have blocked you" hands them a fact about somebody who has just
 * asked not to hear from them, and telling them apart is how a blocked person
 * confirms they were blocked. Both directions are one sentence about the
 * conversation, not about either person.
 */
export async function assertNotBlocked(
	currentUserId: string,
	otherUserId: string,
	database: BlockReader = prisma,
): Promise<void> {
	if (await hasBlockBetween(currentUserId, otherUserId, database)) {
		throw new ForbiddenError("This conversation is unavailable");
	}
}

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

/** Whether a direct room is currently unavailable; groups deliberately return false. */
export async function isDirectConversationBlocked(currentUserId: string, conversationId: string): Promise<boolean> {
	const otherUserId = await findDirectPeerId(currentUserId, conversationId);

	return otherUserId ? hasBlockBetween(currentUserId, otherUserId) : false;
}

/** The transaction-safe form used by a write that may share a read receipt. */
export async function isDirectConversationBlockedInTransaction(
	currentUserId: string,
	conversationId: string,
	database: DirectConversationPolicyReader,
): Promise<boolean> {
	const otherUserId = await findDirectPeerId(currentUserId, conversationId, database);
	if (!otherUserId) return false;

	await lockDirectContactPair(database, currentUserId, otherUserId);
	return hasBlockBetween(currentUserId, otherUserId, database);
}

/** Refuses a recipient-visible write in a direct conversation; groups pass through unchanged. */
export async function assertDirectConversationAvailable(
	currentUserId: string,
	conversationId: string,
	database: DirectConversationPolicyReader,
): Promise<void> {
	if (await isDirectConversationBlockedInTransaction(currentUserId, conversationId, database)) {
		throw new ForbiddenError("This conversation is unavailable");
	}
}

/**
 * Conversation rooms the caller may use for realtime delivery.
 *
 * This is intentionally a database policy, rather than a list of ids fetched
 * into JavaScript and passed to `NOT IN`: a long blocked list must not turn a
 * reconnect into an unbounded query or a giant SQL parameter list. Groups stay
 * visible by policy; only direct rooms with a block in either direction vanish.
 */
export async function listRealtimeConversationIds(currentUserId: string): Promise<string[]> {
	const rows = await prisma.$queryRaw<{ conversationId: string }[]>`
		SELECT participant."conversationId"
		FROM "ConversationParticipant" participant
		JOIN "Conversation" conversation ON conversation.id = participant."conversationId"
		WHERE participant."userId" = ${currentUserId}
			AND (
				conversation."isGroup"
				OR NOT EXISTS (
					SELECT 1
					FROM "ConversationParticipant" peer
					JOIN "UserBlock" block ON (
						(block."blockerId" = ${currentUserId} AND block."blockedId" = peer."userId")
						OR (block."blockerId" = peer."userId" AND block."blockedId" = ${currentUserId})
					)
					WHERE peer."conversationId" = conversation.id
						AND peer."userId" <> ${currentUserId}
				)
			)
	`;

	return rows.map((row) => row.conversationId);
}
