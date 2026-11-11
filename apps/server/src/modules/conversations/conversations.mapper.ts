/**
 * The one shape every conversation query in this module reads, and the mappers
 * that turn it into what leaves the process. Shared by every
 * `conversations.*.service.ts`, so a conversation looks the same whichever
 * operation returned it.
 */
import type {
	ConversationDTO,
	ConversationRole,
	ConversationTheme,
	ConversationUpdatedEvent,
	GroupInvitePolicy,
	MessageDTO,
	ParticipantDTO,
} from "@chatty/shared-types";
import type {
	Prisma,
	ConversationInvitePolicy as DbConversationInvitePolicy,
	ConversationRole as DbConversationRole,
	ConversationTheme as DbConversationTheme,
} from "@prisma/client";
import { buildConversationAvatarUrl } from "../../lib/conversation-avatar-storage.js";
import { messageSelect, toMessageDTO, type MessageRow } from "../messages/messages.mapper.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";

/** Shape returned by every query in this module, so one mapper can serve all of them. */
export const conversationInclude = {
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

export function conversationIncludeForUser(userId: string) {
	return {
		participants: conversationInclude.participants,
		pinnedMessages: conversationInclude.pinnedMessages,
		messages: {
			...conversationInclude.messages,
			where: { hiddenFor: { none: { userId } } },
		},
	} satisfies Prisma.ConversationInclude;
}

export interface ConversationRow {
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

export const themeByWireValue: Record<ConversationTheme, DbConversationTheme> = {
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
 * Shared by every mapper here, so a participant looks the same everywhere one appears.
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
export function toConversationDTO(row: ConversationRow, unreadCount: number, viewerId: string): ConversationDTO {
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
export function toConversationUpdatedEvent(row: ConversationRow): ConversationUpdatedEvent {
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
