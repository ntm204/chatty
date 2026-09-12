import type {
	ConversationDTO,
	ConversationPageDTO,
	ConversationReadEvent,
	ConversationRole,
	ConversationSelfUpdatedEvent,
	ConversationTheme,
	ConversationUpdatedEvent,
	GroupInvitePolicy,
	MessageDTO,
	ParticipantDTO,
} from "@chatty/shared-types";
import {
	Prisma,
	type ConversationInvitePolicy as DbConversationInvitePolicy,
	type ConversationRole as DbConversationRole,
	type ConversationTheme as DbConversationTheme,
} from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import {
	buildConversationAvatarUrl,
	deleteConversationAvatar,
	findConversationAvatarPath,
	saveConversationAvatar,
} from "../../lib/conversation-avatar-storage.js";
import { messageSelect, toMessageDTO, type MessageRow } from "../messages/messages.mapper.js";
import { assertDirectContactAvailable, isDirectConversationBlockedInTransaction } from "../blocks/blocks.service.js";
import { isDirectConversationRestricted } from "../restrictions/restrictions.service.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";
import type {
	AddParticipantInput,
	ArchiveConversationInput,
	CreateConversationInput,
	MarkReadInput,
	MuteConversationInput,
	PinConversationInput,
	RenameConversationInput,
	SetInvitePolicyInput,
	SetNicknameInput,
	SetParticipantRoleInput,
	SetQuickReactionInput,
	SetThemeInput,
} from "./conversations.schema.js";

const MAX_PINNED_CONVERSATIONS = 5;

/**
 * How many unpinned rows a page of the sidebar carries.
 *
 * Enough that the first screen is full on any ordinary display without a second
 * request, and small enough that somebody with hundreds of conversations is not
 * paying for all of them on every reconnect.
 */
const DEFAULT_CONVERSATION_PAGE_SIZE = 30;

/** Shape returned by every query below, so one mapper can serve all of them. */
const conversationInclude = {
	participants: {
		select: {
			// The shared marker, not `lastReadMessageId`. Nothing that leaves this
			// process reads the private one — see `mapParticipants`.
			lastSharedReadMessageId: true,
			role: true,
			archivedAt: true,
			pinnedAt: true,
			mutedUntil: true,
			nickname: true,
			user: { select: userSelect },
		},
	},
	messages: {
		take: 1,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		select: messageSelect,
	},
	pinnedMessages: {
		orderBy: { pinnedAt: "desc" },
		select: {
			messageId: true,
			pinnedAt: true,
			pinnedById: true,
			message: { select: messageSelect },
		},
	},
} satisfies Prisma.ConversationInclude;

function conversationIncludeForUser(userId: string) {
	return {
		participants: conversationInclude.participants,
		pinnedMessages: conversationInclude.pinnedMessages,
		messages: {
			...conversationInclude.messages,
			where: { hiddenFor: { none: { userId } } },
		},
	} satisfies Prisma.ConversationInclude;
}

interface ConversationRow {
	id: string;
	isGroup: boolean;
	name: string | null;
	invitePolicy: DbConversationInvitePolicy;
	avatarUpdatedAt: Date | null;
	themeColor: DbConversationTheme | null;
	quickReactionEmoji: string | null;
	updatedAt: Date;
	participants: {
		lastSharedReadMessageId: string | null;
		role: DbConversationRole;
		archivedAt: Date | null;
		pinnedAt: Date | null;
		mutedUntil: Date | null;
		nickname: string | null;
		user: UserRow;
	}[];
	messages: MessageRow[];
	pinnedMessages: {
		messageId: string;
		pinnedAt: Date;
		pinnedById: string;
		message: MessageRow;
	}[];
}

const conversationRoleByDatabaseValue: Record<DbConversationRole, ConversationRole> = {
	ADMIN: "admin",
	MEMBER: "member",
};

const invitePolicyByDatabaseValue: Record<DbConversationInvitePolicy, GroupInvitePolicy> = {
	EVERYONE: "everyone",
	MANAGERS: "managers",
};

const themeByDatabaseValue: Record<DbConversationTheme, ConversationTheme> = {
	AZURE: "azure",
	AMBER: "amber",
	MOSS: "moss",
	PLUM: "plum",
	CLAY: "clay",
	TEAL: "teal",
	IRIS: "iris",
	FERN: "fern",
};

const themeByWireValue: Record<ConversationTheme, DbConversationTheme> = {
	azure: "AZURE",
	amber: "AMBER",
	moss: "MOSS",
	plum: "PLUM",
	clay: "CLAY",
	teal: "TEAL",
	iris: "IRIS",
	fern: "FERN",
};

/**
 * Shared by every mapper below, so a participant looks the same everywhere one appears.
 *
 * `lastReadMessageId` on the wire is fed by `lastSharedReadMessageId` in the
 * database, and that substitution is the entire server side of "turn read
 * receipts off". A participant who has turned them off has no shared marker, so
 * there is nothing here to filter out per viewer and nothing a broadcast can
 * leak — the value simply is not in the row this reads. See the schema comment
 * on the column.
 */
function mapParticipants(rows: ConversationRow["participants"]): ParticipantDTO[] {
	return rows.map(({ user, lastSharedReadMessageId, role, nickname }) => ({
		...toUserDTO(user, true),
		role: conversationRoleByDatabaseValue[role],
		lastReadMessageId: lastSharedReadMessageId,
		nickname,
	}));
}

/**
 * `unreadCount` is passed in rather than read off the row because it is the one
 * field that differs per viewer: the same conversation is "3 unread" to one
 * participant and "0 unread" to the person who just wrote those three messages.
 */
function toConversationDTO(row: ConversationRow, unreadCount: number, viewerId: string): ConversationDTO {
	const participants = mapParticipants(row.participants);
	const viewer = row.participants.find((participant) => participant.user.id === viewerId);

	const latest = row.messages[0];
	// Mapped by the messages module rather than here, so a message carries the
	// same fields in the sidebar as it does in the conversation — an attachment
	// on the newest message is the first thing that would have diverged.
	const lastMessage: MessageDTO | null = latest ? toMessageDTO(latest) : null;

	return {
		id: row.id,
		isGroup: row.isGroup,
		name: row.name,
		invitePolicy: invitePolicyByDatabaseValue[row.invitePolicy],
		avatarUrl: buildConversationAvatarUrl(row.id, row.avatarUpdatedAt),
		themeColor: row.themeColor ? themeByDatabaseValue[row.themeColor] : null,
		quickReactionEmoji: row.quickReactionEmoji,
		participants,
		lastMessage,
		unreadCount,
		isPinned: viewer?.pinnedAt !== null && viewer?.pinnedAt !== undefined,
		isArchived: viewer?.archivedAt !== null && viewer?.archivedAt !== undefined,
		mutedUntil: viewer?.mutedUntil?.toISOString() ?? null,
		pinnedMessages: row.pinnedMessages.map((pinned) => ({
			messageId: pinned.messageId,
			content: pinned.message.content,
			message: toMessageDTO(pinned.message),
			pinnedAt: pinned.pinnedAt.toISOString(),
			pinnedById: pinned.pinnedById,
		})),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/**
 * The broadcast-safe view of a conversation: everything `conversation:updated`
 * carries, and nothing it doesn't. See the type's own doc comment in
 * shared-types for why `unreadCount` and `lastMessage` are not in here — a
 * value that means something different to each recipient cannot go in a
 * payload sent to a whole room at once.
 */
function toConversationUpdatedEvent(row: ConversationRow): ConversationUpdatedEvent {
	return {
		conversationId: row.id,
		name: row.name,
		invitePolicy: invitePolicyByDatabaseValue[row.invitePolicy],
		avatarUrl: buildConversationAvatarUrl(row.id, row.avatarUpdatedAt),
		themeColor: row.themeColor ? themeByDatabaseValue[row.themeColor] : null,
		quickReactionEmoji: row.quickReactionEmoji,
		participants: mapParticipants(row.participants),
	};
}

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
 * `>=`, not `>`, and it is not an off-by-one. Both columns are millisecond
 * timestamps written by the application, so a message sent in the same
 * millisecond as somebody joining is a genuine tie — and it is a tie in tests
 * constantly, where a fixture creates a conversation and sends into it in one
 * breath. Counting that message is the friendlier way to be wrong: the reader
 * sees something they may already have known about, rather than never being told
 * about a message at all.
 */
async function countUnreadByConversation(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
	if (conversationIds.length === 0) return new Map();

	const rows = await prisma.$queryRaw<UnreadCountRow[]>`
		SELECT m."conversationId", COUNT(*)::int AS "unreadCount"
		FROM "Message" m
		JOIN "ConversationParticipant" p
			ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
		LEFT JOIN "Message" marker ON marker.id = p."lastReadMessageId"
		WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
			AND m."kind" = 'USER'
			AND m."authorId" IS DISTINCT FROM ${userId}
			AND m."deletedAt" IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM "MessageHiddenFor" h
				WHERE h."messageId" = m.id AND h."userId" = ${userId}
			)
			AND NOT EXISTS (
				SELECT 1 FROM "UserRestriction" r
				WHERE r."restrictorId" = ${userId} AND r."restrictedId" = m."authorId"
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
type DirectConversationReader = Pick<Prisma.TransactionClient, "conversation">;

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
async function subscribeParticipantsToRoom(participantIds: string[], conversationId: string): Promise<void> {
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
function announceNewConversation(participantIds: string[], conversation: ConversationDTO): void {
	const io = getIO();

	for (const userId of participantIds) {
		io.to(userRoom(userId)).emit("conversation:new", conversation);
	}
}

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
 * Tells whoever is still in a conversation that shared membership or settings changed.
 *
 * To the conversation room, not per-user like `conversation:new` — everyone
 * left in it should see the same membership and policy, and by the time this fires
 * a removed participant's sockets have already been evicted from that room
 * (see `evictParticipantFromRoom`), so they do not receive it.
 */
function announceConversationUpdated(conversationId: string, event: ConversationUpdatedEvent): void {
	getIO().to(conversationId).emit("conversation:updated", event);
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

function toConversationSelfUpdatedEvent(row: {
	conversationId: string;
	pinnedAt: Date | null;
	archivedAt: Date | null;
	mutedUntil: Date | null;
}): ConversationSelfUpdatedEvent {
	return {
		conversationId: row.conversationId,
		isPinned: row.pinnedAt !== null,
		isArchived: row.archivedAt !== null,
		mutedUntil: row.mutedUntil?.toISOString() ?? null,
	};
}

function announceConversationSelfUpdated(userId: string, event: ConversationSelfUpdatedEvent): void {
	getIO().to(userRoom(userId)).emit("conversation:self-updated", event);
}

const selfStateSelect = {
	conversationId: true,
	pinnedAt: true,
	archivedAt: true,
	mutedUntil: true,
} as const;

export async function setConversationArchived(
	userId: string,
	conversationId: string,
	input: ArchiveConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: {
			archivedAt: input.archived ? new Date() : null,
			// A row cannot be intentionally prominent and hidden at once.
			...(input.archived ? { pinnedAt: null } : {}),
		},
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationPinned(
	userId: string,
	conversationId: string,
	input: PinConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`
			SELECT id FROM "ConversationParticipant"
			WHERE "userId" = ${userId}
			FOR UPDATE
		`;
		if (input.pinned) {
			const pinnedCount = await transaction.conversationParticipant.count({
				where: { userId, pinnedAt: { not: null }, conversationId: { not: conversationId } },
			});
			if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
				throw new ValidationError(`You can pin up to ${MAX_PINNED_CONVERSATIONS} conversations`);
			}
		}

		return transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId } },
			data: {
				pinnedAt: input.pinned ? new Date() : null,
				...(input.pinned ? { archivedAt: null } : {}),
			},
			select: selfStateSelect,
		});
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationMuted(
	userId: string,
	conversationId: string,
	input: MuteConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const until = input.until ? new Date(input.until) : null;
	if (until && until.getTime() <= Date.now()) throw new ValidationError("Mute end time must be in the future");

	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: { mutedUntil: until },
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

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
	const nextTheme = input.theme ? themeByWireValue[input.theme] : null;

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

/**
 * Moves the caller's read marker to `messageId`.
 *
 * Returns where the marker ended up, which is not always where the caller asked
 * for it — see the backwards check below. The client renders from the returned
 * event rather than from what it sent, so the two cannot disagree.
 */
export async function markConversationRead(
	currentUserId: string,
	conversationId: string,
	input: MarkReadInput,
): Promise<ConversationReadEvent> {
	const { areReceiptsShared, didMove, event } = await prisma.$transaction(async (transaction) => {
		await assertParticipant(currentUserId, conversationId, transaction);
		// A block still lets someone clear their *own* unread badge. What it may
		// not do is advance a shared marker that becomes visible if contact is
		// restored later, so the pair lock and policy check decide whether this
		// read remains private.
		const isBlocked = await isDirectConversationBlockedInTransaction(currentUserId, conversationId, transaction);
		// A restriction is one-directional and silent: the restricted peer must
		// not learn their messages were seen, but the restrictor's own private
		// marker still advances below — their badge clears exactly as normal.
		const isRestrictingPeer = await isDirectConversationRestricted(currentUserId, conversationId, transaction);

		const message = await transaction.message.findUnique({
			where: { id: input.messageId },
			select: { id: true, conversationId: true, createdAt: true },
		});

		// Same error for "no such message" and "a message in someone else's
		// conversation", so this cannot be used to test whether an id exists.
		if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

		const participant = await transaction.conversationParticipant.findUniqueOrThrow({
			where: { conversationId_userId: { conversationId, userId: currentUserId } },
			select: { lastReadMessageId: true, user: { select: { readReceiptsEnabled: true } } },
		});
		const areReceiptsShared = participant.user.readReceiptsEnabled && !isBlocked && !isRestrictingPeer;

		if (participant.lastReadMessageId) {
			const currentMarker = await transaction.message.findUnique({
				where: { id: participant.lastReadMessageId },
				select: { createdAt: true },
			});

			// A marker only ever moves forward. Scrolling up loads older messages and
			// the client marks what it sees, so without this the marker would follow
			// the viewport backwards and a conversation someone had fully read would
			// turn unread again the moment they looked at its history.
			if (currentMarker && currentMarker.createdAt >= message.createdAt) {
				return {
					areReceiptsShared,
					// Nothing was written, so nothing is announced. Scrolling up marks
					// every older message the viewport passes, and an event apiece would
					// have every client in the room patching state and re-rendering for a
					// marker that did not move.
					didMove: false,
					event: { conversationId, userId: currentUserId, lastReadMessageId: participant.lastReadMessageId },
				};
			}
		}

		await transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId: currentUserId } },
			data: {
				lastReadMessageId: message.id,
				// The private marker always moves — clearing your own badge is nobody
				// else's business. The shared one moves only when receipts are on and
				// direct contact is currently allowed.
				...(areReceiptsShared && { lastSharedReadMessageId: message.id }),
			},
			select: { id: true },
		});

		return {
			areReceiptsShared,
			didMove: true,
			event: { conversationId, userId: currentUserId, lastReadMessageId: message.id },
		};
	});

	if (!didMove) return event;

	if (areReceiptsShared) {
		// To the room, so the author sees "Seen" appear without polling. The reader's
		// own other tabs are in that room too, which is what keeps a badge cleared on
		// the phone from staying lit on the laptop.
		getIO().to(conversationId).emit("conversation:read", event);
	} else {
		// Only this reader's own devices. They still need the badge cleared on the
		// laptop when they read on the phone; nobody else gets told anything, which
		// is the same promise the unwritten shared marker makes.
		getIO().to(userRoom(currentUserId)).emit("conversation:read", event);
	}

	return event;
}

/**
 * Withdraws every read receipt this user has given, everywhere.
 *
 * Called when they turn receipts off. Leaving the shared markers where they are
 * would keep yesterday's "Seen" on other people's screens after a setting that
 * says otherwise — and the markers are what the DTO reads, so clearing them is
 * the whole of it.
 *
 * The broadcast is what makes it visible now rather than after a reload:
 * `conversation:updated` already carries every participant's marker, so it is
 * the event that says "these are the markers, forget what you had". One emit per
 * conversation, on an action nobody performs twice in a day.
 *
 * Exported for `users.service`, which owns the setting; the conversation-shaped
 * half of it belongs here for the same reason `assertParticipant` does.
 */
export async function clearSharedReadMarkers(userId: string): Promise<void> {
	const memberships = await prisma.conversationParticipant.findMany({
		where: { userId, lastSharedReadMessageId: { not: null } },
		select: { conversationId: true },
	});
	if (memberships.length === 0) return;

	await prisma.conversationParticipant.updateMany({
		where: { userId },
		data: { lastSharedReadMessageId: null },
	});

	const conversations = await prisma.conversation.findMany({
		where: { id: { in: memberships.map((membership) => membership.conversationId) } },
		include: conversationInclude,
	});

	for (const conversation of conversations) {
		announceConversationUpdated(conversation.id, toConversationUpdatedEvent(conversation));
	}
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

/**
 * Serialises a group mutation, then confirms its actor and target kind.
 *
 * Shared by every group-only operation below (add, remove, rename). A direct
 * conversation always has exactly its original two participants — the schema
 * comment on `Conversation.isGroup` already explains why that has to stay true
 * by construction: deriving it from a headcount instead would let a direct
 * chat that gained a third member silently become a group.
 *
 * Membership is checked only after the lock, so a concurrent leave cannot pass
 * authorization against a row that disappears before the write.
 */
async function prepareGroupMutation(
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
async function assertAdmin(
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
async function displayNamesOf(transaction: Prisma.TransactionClient, userIds: string[]): Promise<string[]> {
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
async function createSystemMessage(
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
function announceSystemMessage(message: MessageRow): void {
	getIO().to(message.conversationId).emit("message:new", toMessageDTO(message));
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

/** Re-reads a conversation after a write, for the two shapes callers below need from it. */
async function reloadConversation(
	transaction: Prisma.TransactionClient,
	conversationId: string,
): Promise<ConversationRow> {
	return transaction.conversation.findUniqueOrThrow({
		where: { id: conversationId },
		include: conversationInclude,
	});
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
