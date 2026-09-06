import type {
	AttachmentDTO,
	ConversationDTO,
	ConversationRole,
	CurrentUserDTO,
	MessageDTO,
	ParticipantDTO,
	UserDTO,
} from "@chatty/shared-types";

/**
 * Builders for the wire types, shared by every test file.
 *
 * Here rather than copied per test because these shapes grow: adding
 * `unreadCount` and `lastReadMessageId` broke a fixture in three files at once,
 * and each copy had to be found and fixed by hand. One builder means the next
 * field is a one-line change.
 *
 * Every argument past the identifying ones is optional and defaults to
 * something inert, so a test only states the part it is actually about.
 */

const FIXED_DATE = "2026-01-01T00:00:00.000Z";

export function makeUser(id: string, displayName: string): UserDTO {
	return { id, handle: id, displayName, avatarUrl: null, createdAt: FIXED_DATE, lastSeenAt: null };
}

/**
 * You, rather than someone else. Separate from `makeUser` for the same reason
 * the wire types are separate: `email` belongs only to your own profile, and a
 * builder that adds it to everyone makes leaking it into a `UserDTO` easy.
 */
export function makeCurrentUser(overrides: Partial<CurrentUserDTO> = {}): CurrentUserDTO {
	return {
		...makeUser("minh", "Minh"),
		email: "minh@chatty.test",
		readReceiptsEnabled: true,
		presenceVisibility: "contacts",
		...overrides,
	};
}

export function makeParticipant(
	id: string,
	displayName: string,
	lastReadMessageId: string | null = null,
	role: ConversationRole = "member",
	nickname: string | null = null,
): ParticipantDTO {
	return { ...makeUser(id, displayName), role, lastReadMessageId, nickname };
}

/**
 * A message from a person. `authorId` doubles as the author's display name,
 * which is enough for everything that renders one — a test that cares about
 * the two differing builds the author itself.
 */
export function makeMessage(
	id: string,
	authorId: string,
	content: string,
	attachments: AttachmentDTO[] = [],
	// Last, and both defaulting to "never": a message that was neither edited nor
	// deleted is what every existing test means by one, and adding these ahead of
	// `attachment` would have rewritten every call site to say so.
	overrides: Pick<
		Partial<MessageDTO>,
		"authorActionExpiresAt" | "createdAt" | "editedAt" | "deletedAt" | "reactions" | "replyTo"
	> = {},
): MessageDTO {
	return {
		id,
		conversationId: "conversation-1",
		kind: "user",
		author: makeUser(authorId, authorId),
		content,
		attachments,
		isSticker: false,
		isForwarded: false,
		mentionedUserIds: [],
		createdAt: "2026-08-23T10:00:00.000Z",
		authorActionExpiresAt: "2099-08-23T18:00:00.000Z",
		editedAt: null,
		deletedAt: null,
		reactions: [],
		replyTo: null,
		...overrides,
	};
}

/**
 * A group event — "An added Binh", "Chi left the group".
 *
 * Nobody wrote it, so there is no author to pass: that null is the whole
 * difference, and it is what the message list branches on.
 */
export function makeSystemMessage(id: string, content: string): MessageDTO {
	return {
		id,
		conversationId: "conversation-1",
		kind: "system",
		author: null,
		content,
		attachments: [],
		isSticker: false,
		isForwarded: false,
		mentionedUserIds: [],
		createdAt: "2026-08-23T10:00:00.000Z",
		authorActionExpiresAt: null,
		// Not overridable, unlike `makeMessage`: nobody wrote a system line, so
		// there is nobody who may change it — the database refuses both.
		editedAt: null,
		deletedAt: null,
		// A system line cannot be reacted to or replied to either — the service
		// refuses both — so these are flat empties rather than overridable.
		reactions: [],
		replyTo: null,
	};
}

/**
 * A message whose author deleted their account.
 *
 * Still `kind: "user"` — somebody wrote it — with no author to point at. That
 * combination used to be impossible and is what the list has to tell apart from
 * a system line, which is the reason this is its own builder rather than an
 * override on `makeMessage`.
 */
export function makeOrphanedMessage(id: string, content: string): MessageDTO {
	return { ...makeMessage(id, "gone", content), author: null };
}

/**
 * The url is deliberately a throwaway: it carries a signed token in the real
 * thing, and nothing on the client may treat it as an identity.
 */
export function makeAttachment(overrides: Partial<AttachmentDTO> = {}): AttachmentDTO {
	return {
		id: "attachment-1",
		kind: "image",
		url: "http://api.test/attachments/attachment-1?token=signed",
		thumbUrl: "http://api.test/attachments/attachment-1?token=signed&size=thumb",
		width: 800,
		height: 400,
		byteSize: 12_345,
		fileName: null,
		mediaType: "image/webp",
		durationMs: null,
		waveform: [],
		...overrides,
	};
}

export function makeConversation(overrides: Partial<ConversationDTO> = {}): ConversationDTO {
	return {
		id: "conversation-1",
		isGroup: false,
		name: null,
		invitePolicy: "everyone",
		avatarUrl: null,
		themeColor: null,
		quickReactionEmoji: null,
		participants: [],
		lastMessage: null,
		unreadCount: 0,
		isPinned: false,
		isArchived: false,
		mutedUntil: null,
		pinnedMessages: [],
		updatedAt: FIXED_DATE,
		...overrides,
	};
}
