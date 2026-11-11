/**
 * How a conversation comes to exist and how a participant finds it: creation,
 * the paged sidebar, search, a single row, and the contact set presence uses.
 */
import type { ConversationDTO, ConversationPageDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertDirectContactAvailable } from "../blocks/blocks.service.js";
import { conversationInclude, conversationIncludeForUser, toConversationDTO } from "./conversations.mapper.js";
import type { CreateConversationInput, SearchConversationsQuery } from "./conversations.schema.js";
import {
	announceNewConversation,
	assertParticipant,
	countUnreadByConversation,
	subscribeParticipantsToRoom,
} from "./conversations.shared.js";

/**
 * How many unpinned rows a page of the sidebar carries.
 *
 * Enough that the first screen is full on any ordinary display without a second
 * request, and small enough that somebody with hundreds of conversations is not
 * paying for all of them on every reconnect.
 */
const DEFAULT_CONVERSATION_PAGE_SIZE = 30;

type DirectConversationReader = Pick<Prisma.TransactionClient, "conversation">;

/**
 * Finds an existing 1-1 conversation between exactly these two users.
 *
 * Without this, "message Minh" from two different screens creates two threads
 * and splits the history in half. Group conversations are deliberately NOT
 * deduplicated — the same set of people may legitimately want several groups.
 */
async function findExistingDirectConversation(
	userId: string,
	otherUserId: string,
	database: DirectConversationReader = prisma,
): Promise<string | null> {
	const candidates = await database.conversation.findMany({
		where: {
			isGroup: false,
			AND: [{ participants: { some: { userId } } }, { participants: { some: { userId: otherUserId } } }],
		},
		select: { id: true, _count: { select: { participants: true } } },
	});

	// The AND above matches any conversation containing both users; a group that
	// happens to include them would qualify too, so require exactly two members.
	return (
		candidates.find((candidate) => candidate._count.participants === (userId === otherUserId ? 1 : 2))?.id ?? null
	);
}

export async function createConversation(
	currentUserId: string,
	input: CreateConversationInput,
): Promise<ConversationDTO> {
	// Deduplicate, and drop the caller in case the client included them.
	const otherUserIds = [...new Set(input.participantIds)].filter((id) => id !== currentUserId);

	if (otherUserIds.length === 0 && !input.participantIds.includes(currentUserId)) {
		throw new ValidationError("A conversation needs at least one other participant");
	}

	const existingUsers = await prisma.user.findMany({
		where: { id: { in: otherUserIds } },
		select: { id: true },
	});

	if (existingUsers.length !== otherUserIds.length) {
		throw new NotFoundError("One or more participants do not exist");
	}

	const isGroup = otherUserIds.length > 1;

	if (!isGroup) {
		const otherUserId = otherUserIds[0] ?? currentUserId;
		const direct = await prisma.$transaction(async (transaction) => {
			// The lock covers a missing UserBlock row too, so a direct creation and a
			// block cannot both pass their independent reads and commit in the wrong
			// order. It also makes the find-then-create deduplication safe across tabs.
			await assertDirectContactAvailable(currentUserId, otherUserId, transaction);

			const existingId = await findExistingDirectConversation(currentUserId, otherUserId, transaction);
			if (existingId) return { conversationId: existingId, isNew: false };

			const created = await transaction.conversation.create({
				data: {
					isGroup: false,
					participants: { create: [...new Set([currentUserId, otherUserId])].map((userId) => ({ userId })) },
				},
				select: { id: true },
			});

			return { conversationId: created.id, isNew: true };
		});

		const conversation = await prisma.conversation.findUniqueOrThrow({
			where: { id: direct.conversationId },
			include: conversationIncludeForUser(currentUserId),
		});
		const unreadCounts = direct.isNew
			? new Map<string, number>()
			: await countUnreadByConversation(currentUserId, [conversation.id]);
		const conversationDTO = toConversationDTO(conversation, unreadCounts.get(conversation.id) ?? 0, currentUserId);

		if (direct.isNew) {
			const recipients = [...new Set([currentUserId, otherUserId])];
			await subscribeParticipantsToRoom(recipients, conversation.id);
			announceNewConversation(recipients, conversationDTO);
		}

		return conversationDTO;
	}

	const participantIds = [currentUserId, ...otherUserIds];

	// One statement, so a conversation can never exist without its participants.
	const conversation = await prisma.conversation.create({
		data: {
			isGroup,
			name: isGroup ? (input.name ?? null) : null,
			participants: {
				// The creator of a group starts as its admin. In a direct
				// conversation everyone stays a member: the role only decides who
				// may act on *other* people, and there is nobody to administer
				// between two — see ADR 0021.
				create: participantIds.map((userId) => ({
					userId,
					...(isGroup && userId === currentUserId ? { role: "ADMIN" as const } : {}),
				})),
			},
		},
		include: conversationInclude,
	});

	const conversationDTO = toConversationDTO(conversation, 0, currentUserId);

	// Join first, announce second. A client told about the conversation before
	// its socket is in the room could send a message and never see its own
	// broadcast come back.
	await subscribeParticipantsToRoom(participantIds, conversation.id);
	announceNewConversation(participantIds, conversationDTO);

	return conversationDTO;
}

/**
 * A page of the sidebar, newest first, pinned rows above everything.
 *
 * **The pinned rows are never paged, and that is what makes the rest simple.**
 * `MAX_PINNED_CONVERSATIONS` caps them at five per person, so "fetch all of
 * them" is bounded work by construction and the first page can carry the whole
 * set. What is left to page is the ordinary tail, in one order — `updatedAt`
 * descending — which is an ordinary two-column keyset with `id` breaking ties.
 *
 * The alternative was a cursor over `(pinnedAt NULLS LAST, updatedAt, id)`,
 * which needs raw SQL: a row-value comparison cannot express NULLS LAST, and
 * Prisma cannot express the comparison at all. Leaning on the cap instead costs
 * one bounded query and keeps this readable.
 *
 * `id` is the tiebreaker rather than nothing, because `updatedAt` collides:
 * conversations created in the same request, or a seed, share a millisecond,
 * and a cursor over a non-unique column silently skips or repeats rows at the
 * page boundary — the shape of bug phase 12's search paging already had.
 */
export async function listConversationsForUser(
	userId: string,
	query: { isArchived?: boolean; limit?: number; before?: string } = {},
): Promise<ConversationPageDTO> {
	const isArchived = query.isArchived ?? false;
	const limit = query.limit ?? DEFAULT_CONVERSATION_PAGE_SIZE;
	const viewerScope = { userId, ...(isArchived ? { archivedAt: { not: null } } : { archivedAt: null }) };

	// Only on the first page. Later pages are walking the unpinned tail, and
	// repeating the pinned block on each of them would duplicate rows the client
	// already has.
	const pinnedMemberships = query.before
		? []
		: await prisma.conversationParticipant.findMany({
				where: { ...viewerScope, pinnedAt: { not: null } },
				orderBy: [{ pinnedAt: "desc" }, { conversationId: "desc" }],
				select: { conversation: { include: conversationIncludeForUser(userId) } },
			});

	const cursor = query.before
		? await prisma.conversation.findUnique({
				where: { id: query.before },
				select: { id: true, updatedAt: true },
			})
		: null;
	if (query.before && !cursor) throw new NotFoundError("Conversation not found");

	// One more than asked for, so `hasMore` is answered without a second count.
	const unpinnedMemberships = await prisma.conversationParticipant.findMany({
		where: {
			...viewerScope,
			pinnedAt: null,
			...(cursor
				? {
						conversation: {
							OR: [
								{ updatedAt: { lt: cursor.updatedAt } },
								{ updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
							],
						},
					}
				: {}),
		},
		orderBy: [{ conversation: { updatedAt: "desc" } }, { conversationId: "desc" }],
		take: limit + 1,
		select: { conversation: { include: conversationIncludeForUser(userId) } },
	});

	const hasMore = unpinnedMemberships.length > limit;
	const conversations = [
		...pinnedMemberships.map((membership) => membership.conversation),
		...unpinnedMemberships.slice(0, limit).map((membership) => membership.conversation),
	];

	const unreadCounts = await countUnreadByConversation(
		userId,
		conversations.map((conversation) => conversation.id),
	);

	return {
		items: conversations.map((conversation) =>
			toConversationDTO(conversation, unreadCounts.get(conversation.id) ?? 0, userId),
		),
		hasMore,
	};
}

/** Search membership-scoped destinations, including archived rows, with a stable id cursor. */
export async function searchConversationsForUser(
	userId: string,
	query: SearchConversationsQuery,
): Promise<ConversationPageDTO> {
	const text = { contains: query.q, mode: "insensitive" as const };
	const rows = await prisma.conversation.findMany({
		where: {
			participants: { some: { userId } },
			...(query.before ? { id: { lt: query.before } } : {}),
			...(query.q
				? {
						OR: [
							{ name: text },
							{
								participants: {
									some: {
										userId: { not: userId },
										OR: [
											{ nickname: text },
											{ user: { displayName: text } },
											{ user: { handle: text } },
										],
									},
								},
							},
						],
					}
				: {}),
		},
		orderBy: { id: "desc" },
		take: query.limit + 1,
		include: conversationIncludeForUser(userId),
	});
	const selected = rows.slice(0, query.limit);
	const unreadCounts = await countUnreadByConversation(
		userId,
		selected.map((row) => row.id),
	);

	return {
		items: selected.map((row) => toConversationDTO(row, unreadCounts.get(row.id) ?? 0, userId)),
		hasMore: rows.length > query.limit,
	};
}

/**
 * One conversation, as the sidebar would draw it.
 *
 * Exists for the case pagination creates: a message arrives for a conversation
 * far enough down the list that the client has not loaded it, so there is no row
 * to patch. Re-listing would throw away the reader's scroll position, which is
 * the objection that kept item 80 shut for four phases; fetching the one row and
 * putting it on top is what the sidebar would have shown anyway.
 */
export async function getConversationForUser(userId: string, conversationId: string): Promise<ConversationDTO> {
	await assertParticipant(userId, conversationId);

	const conversation = await prisma.conversation.findUniqueOrThrow({
		where: { id: conversationId },
		include: conversationIncludeForUser(userId),
	});
	const unreadCounts = await countUnreadByConversation(userId, [conversationId]);

	return toConversationDTO(conversation, unreadCounts.get(conversationId) ?? 0, userId);
}

/**
 * Everyone who shares at least one conversation with this user, themselves included.
 *
 * This is the audience for their presence, and the set whose presence they are
 * allowed to see. Broadcasting to everyone connected instead would tell every
 * account in the app who else is online — people they have no relationship with.
 */
export async function listContactIds(userId: string): Promise<string[]> {
	const rows = await prisma.$queryRaw<{ userId: string }[]>`
		SELECT DISTINCT peer."userId"
		FROM "ConversationParticipant" participant
		JOIN "Conversation" conversation ON conversation.id = participant."conversationId"
		JOIN "ConversationParticipant" peer ON peer."conversationId" = conversation.id
		WHERE participant."userId" = ${userId}
			AND (
				conversation."isGroup"
				OR NOT EXISTS (
					SELECT 1
					FROM "UserBlock" block
					WHERE (block."blockerId" = ${userId} AND block."blockedId" = peer."userId")
						OR (block."blockerId" = peer."userId" AND block."blockedId" = ${userId})
				)
			)
	`;

	return rows.map((row) => row.userId);
}
