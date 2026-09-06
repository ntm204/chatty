/**
 * Types that cross the wire between apps/server and apps/web.
 * Keep these in sync with prisma/schema.prisma by hand — Prisma's generated
 * types live only in the server; these are the trimmed-down "safe to send
 * to a client" shapes (e.g. no password hashes).
 */

/** Another user, as shown to you — a conversation participant, a message author. */
export interface UserDTO {
	id: string;
	/**
	 * Unique, lowercase, public. Display names are not unique, so this is what
	 * tells two people with the same name apart in a search result.
	 */
	handle: string;
	displayName: string;
	/**
	 * Absolute URL of the user's avatar, or null when they have not set one.
	 *
	 * Derived by the server, never stored: the database keeps only
	 * `avatarUpdatedAt`, and this URL is built from it as
	 * `{PUBLIC_URL}/users/{id}/avatar?v={timestamp}`. Two consequences worth
	 * knowing on the client side:
	 *
	 * - It is safe to cache hard. The `v` changes the moment the picture does,
	 *   so a stale image cannot survive an upload.
	 * - It is stable across storage backends. Moving the files from local disk
	 *   to S3 changes nothing here, because no row ever held a storage path.
	 */
	avatarUrl: string | null;
	createdAt: string; // ISO 8601
	/** Null when privacy rules do not allow the viewer to see it. */
	lastSeenAt: string | null;
}

/** A bounded page of people the signed-in user has blocked. */
export interface BlockedUsersPageDTO {
	items: UserDTO[];
	/** Pass this to the next request; null means the final page. */
	nextCursor: string | null;
}

/** The caller's own block state for one person. It never reveals the reverse direction. */
export interface BlockStatusDTO {
	isBlocked: boolean;
}

/** A bounded page of people the signed-in user has restricted. */
export interface RestrictedUsersPageDTO {
	items: UserDTO[];
	/** Pass this to the next request; null means the final page. */
	nextCursor: string | null;
}

/**
 * The caller's own restriction state for one person.
 *
 * Never the reverse direction, and for a stronger reason than the block
 * equivalent: a block is observable to the person blocked the moment they try to
 * send, while a restriction is designed to be unobservable. Answering "has this
 * person restricted me?" would hand back the one thing the feature withholds.
 */
export interface RestrictionStatusDTO {
	isRestricted: boolean;
}

export type PresenceVisibility = "everyone" | "contacts" | "nobody";

/**
 * Your own account. Separate from UserDTO because `email` belongs to you and
 * must never ride along on someone else's profile — keeping them as one type
 * makes that leak a one-character mistake.
 */
export interface CurrentUserDTO extends UserDTO {
	email: string;
	/**
	 * Whether other people may see how far you have read.
	 *
	 * Only on your own profile, never on `UserDTO`: whether somebody else shares
	 * their receipts is visible in the effect (their marker simply stops arriving),
	 * and publishing the setting itself would announce "this person is hiding" to
	 * everyone they talk to.
	 *
	 * **Symmetric.** With this false the server stops sharing your marker *and* the
	 * client stops drawing anyone else's "Seen" — hiding yours while still reading
	 * theirs is the arrangement people are right to call unfair.
	 */
	readReceiptsEnabled: boolean;
	presenceVisibility: PresenceVisibility;
}

/**
 * A user seen through their membership of one conversation.
 *
 * Extends UserDTO rather than replacing it, so anything that only needs the
 * profile (a title, an avatar) keeps accepting a participant unchanged.
 */
export interface ParticipantDTO extends UserDTO {
	/**
	 * What this participant may do to the group: an admin manages members,
	 * naming, roles and invite policy — symmetric with every other admin; a
	 * member may always leave and may invite only while the group policy is
	 * open.
	 *
	 * Present on a direct conversation's participants too, where it is always
	 * "member" and means nothing — a two-person chat has nothing to administer.
	 * See ADR 0021.
	 */
	role: ConversationRole;
	/**
	 * The newest message this participant has read, or null if they never have.
	 *
	 * Enough to render "Seen" without a second request: a message is read by
	 * someone when it is at or before their marker. The client compares by
	 * position in the loaded list rather than by timestamp, because ids are what
	 * the server commits to.
	 *
	 * **The shared marker, not the real one.** A participant with read receipts
	 * turned off keeps reading and keeps clearing their own badge; what stops is
	 * this value moving. So a null here — or a marker that has stopped advancing —
	 * means "not shared", which is indistinguishable from "not read", and that is
	 * the point.
	 */
	lastReadMessageId: string | null;
	/**
	 * How everyone in this conversation sees this participant labeled, or null
	 * for their real `displayName`. Shared, not per-viewer — set by any
	 * participant, visible to all of them, the same way Messenger's chat
	 * nicknames work. See ADR 0022.
	 */
	nickname: string | null;
}

/**
 * A participant's standing in a group.
 *
 * Lowercase on the wire, uppercase in the database (`ConversationRole` in
 * schema.prisma). The mapper is the one place that knows both spellings, the
 * same way `createdAt` is a Date on one side and an ISO string on the other.
 */
export type ConversationRole = "admin" | "member";
export type GroupInvitePolicy = "everyone" | "managers";

/**
 * The conversation's shared accent color, or null for the fixed default.
 * Restricted to the avatar-tint tokens already in the design palette — see
 * `@/constants/avatar-colors` on the web side. See ADR 0022.
 */
export type ConversationTheme = "azure" | "amber" | "moss" | "plum" | "clay" | "teal" | "iris" | "fern";

export interface ConversationDTO {
	id: string;
	isGroup: boolean;
	name: string | null; // null for 1-1 conversations; derived from participants on the client
	/** Who may add people; meaningful only for groups. */
	invitePolicy: GroupInvitePolicy;
	/** A group's own photo, or null (initials shown instead). Always null for a direct conversation — see ADR 0022. */
	avatarUrl: string | null;
	/** The whole conversation's shared accent, or null for the fixed default. Any participant may change it. */
	themeColor: ConversationTheme | null;
	/** Overrides the app-wide default reaction a double-click leaves, or null for that default. */
	quickReactionEmoji: string | null;
	participants: ParticipantDTO[];
	lastMessage: MessageDTO | null;
	/**
	 * Messages in this conversation, written by someone else, newer than the
	 * viewer's read marker. Computed per viewer, so it is only meaningful in a
	 * response to the person who asked.
	 */
	unreadCount: number;
	/** Per-viewer list state; never broadcast to the conversation room. */
	isPinned: boolean;
	isArchived: boolean;
	mutedUntil: string | null;
	pinnedMessages: PinnedMessageDTO[];
	updatedAt: string;
}

/**
 * An image sent with a message.
 *
 * `width` and `height` are the stored image's, after the server's re-encode —
 * not the original's. They are here so the message list can reserve the right
 * space before the picture has loaded; without them every arriving image shoves
 * the conversation around as it decodes.
 */
export type AttachmentKind = "image" | "file" | "audio";

export interface AttachmentDTO {
	id: string;
	kind: AttachmentKind;
	/**
	 * Absolute, and **signed and short-lived** — unlike `UserDTO.avatarUrl`,
	 * which is public and cached forever.
	 *
	 * An attachment is private content inside a conversation, and an `<img>` tag
	 * cannot send an Authorization header, so the proof rides in the URL: the
	 * server mints a token only in a response whose membership it has already
	 * checked. Two consequences on the client side:
	 *
	 * - **Do not persist it.** It expires, and a stored copy becomes a broken
	 *   image. Re-fetch the message to get a fresh one.
	 * - **It is not an identity.** The token is re-minted on every read, so the
	 *   same image can arrive under a different URL each time — though not
	 *   reliably so, since a JWT's `iat` has one-second resolution and two reads
	 *   in the same second produce the same string. Sometimes-stable is the worst
	 *   case for anything keyed on it: a cache, a React `key`, a dedupe. Key on
	 *   `id`.
	 */
	url: string;
	thumbUrl: string | null;
	width: number | null;
	height: number | null;
	byteSize: number;
	fileName: string | null;
	mediaType: string;
	durationMs: number | null;
	waveform: number[];
}

export interface AttachmentWithMessageDTO extends AttachmentDTO {
	messageId: string;
	messageCreatedAt: string;
	authorName: string | null;
}

export interface AttachmentPageDTO {
	items: AttachmentWithMessageDTO[];
	hasMore: boolean;
}

/**
 * How much of each kind a conversation holds, for the category rows in its
 * details panel.
 *
 * Counted with exactly the filters the matching list pages with, hidden-for-me
 * messages included: a row that says 9 and opens onto 8 files is worse than no
 * number at all. `members` is absent because `ConversationDTO` already carries
 * its participants, so the client can count them without asking.
 */
export interface ConversationVaultSummaryDTO {
	media: number;
	files: number;
	voice: number;
	links: number;
	saved: number;
}

export interface MessageLinkDTO {
	id: string;
	messageId: string;
	url: string;
	createdAt: string;
	authorName: string | null;
}

export interface MessageLinkPageDTO {
	items: MessageLinkDTO[];
	hasMore: boolean;
}

export interface PinnedMessageDTO {
	message?: MessageDTO;
	messageId: string;
	content: string;
	pinnedAt: string;
	pinnedById: string;
}

/**
 * Who a message came from: a person, or the conversation itself.
 *
 * "system" is what a group event looks like in the log — "An added Binh",
 * "Chi left the group". It is a real Message row rather than a client-side
 * annotation on `conversation:updated`, so it survives a reload, arrives in
 * order with the messages around it, and can be scrolled back to.
 */
export type MessageKind = "user" | "system";

/**
 * One emoji, as a reaction.
 *
 * An alias over `string`, so it carries no guarantee the type system can check —
 * which is exactly why the rule lives somewhere that can. The server accepts a
 * single fully-qualified RGI emoji and rejects everything else at the request
 * boundary, and that is what makes "the same reaction" decidable: U+2764 and
 * U+2764 U+FE0F are two strings and one heart, and only the qualified one gets
 * through. Named rather than inlined so every signature that carries one says so.
 *
 * This was a closed union of five names until phase 29. The set is open now for
 * the reason every other messenger's is: a reaction is a reply that costs one
 * tap, and five words is not a vocabulary.
 */
export type ReactionEmoji = string;

/**
 * One emoji left on a message, and everyone who left it.
 *
 * `userIds` rather than a count plus an `isMine` flag, because this DTO is
 * broadcast: the server sends one payload to every socket in the conversation,
 * so anything answering "is this me?" would be answering it for whoever
 * happened to trigger the write. The viewer holds their own id and decides.
 * It also means a client can name the people without another request — which is
 * the whole of what the reactor list is built from.
 */
export interface ReactionDTO {
	emoji: ReactionEmoji;
	userIds: string[];
}

/**
 * Just enough of the message a reply answers to quote it.
 *
 * Resolved live from the parent row rather than copied at send time, so an
 * edited original re-quotes with its new text and a deleted one quotes as a
 * tombstone instead of preserving words its author retracted.
 *
 * Not a whole `MessageDTO`: that would recurse — a reply to a reply to a reply
 * would carry the entire chain down the wire — and the quote shows one line.
 */
/**
 * One image in somebody's sticker tray.
 *
 * `url` carries the same signed, expiring token an attachment's does and for
 * the same reason — an `<img>` cannot send an Authorization header. See
 * ADR 0007.
 */
export interface StickerDTO {
	id: string;
	url: string;
	width: number;
	height: number;
	createdAt: string;
}

export interface MessageReplyDTO {
	id: string;
	/** Null when the parent is a system line, or its author deleted their account. */
	authorName: string | null;
	/** Empty when the parent was an image with no caption, or was deleted. */
	content: string;
	hasAttachment: boolean;
	/** Signed preview URL for the parent's image, or null after it is deleted. */
	attachmentUrl: string | null;
	/** True when the parent has since been deleted — quote it as a tombstone. */
	isDeleted: boolean;
}

export interface MessageDTO {
	id: string;
	conversationId: string;
	kind: MessageKind;
	/**
	 * Who wrote it, embedded rather than referenced by id.
	 *
	 * The id alone was not enough: the client resolved it against the
	 * conversation's participant list, so every message written by someone who
	 * has since left the group lost its name and avatar — the history stayed,
	 * the person vanished from it. A participant list answers "who is here
	 * now", which is a different question from "who wrote this".
	 *
	 * Null on a system message, which nobody wrote.
	 */
	author: UserDTO | null;
	/**
	 * Empty string for a message that is only an image.
	 *
	 * On a system message this is the whole sentence, rendered by the server
	 * when the event happened — see ADR 0009 for why the names in it are a
	 * snapshot rather than looked up live.
	 */
	content: string;
	/**
	 * The images on this message, in the order the sender chose.
	 *
	 * An array rather than a single nullable image since phase 22, and empty
	 * rather than null when there are none — a caller that maps over it needs no
	 * branch, which is what stops "no images" and "one image" being two shapes
	 * every renderer has to tell apart.
	 *
	 * Always empty on a tombstone: deleting a message removes its image rows and
	 * their files in the same write.
	 */
	attachments: AttachmentDTO[];
	/**
	 * Whether this message is a sticker rather than a photograph.
	 *
	 * Carried rather than inferred from "one image and no text": that shape is
	 * also a picture sent without a caption, and the two render nothing alike.
	 */
	isSticker: boolean;
	isForwarded: boolean;
	/** Stable ids; display names are resolved from current participants. */
	mentionedUserIds: string[];
	createdAt: string;
	/**
	 * When author-only edit and “delete for everyone” actions expire.
	 *
	 * Null for system messages. Clients use this to hide actions that the server
	 * would reject, while the server still enforces the deadline independently.
	 */
	authorActionExpiresAt: string | null;
	/**
	 * When the author last changed the text, or null if they never have.
	 *
	 * Present so a reader can tell a message that was rewritten from one that was
	 * always this way — without it, editing is a silent rewrite of what someone
	 * remembers reading.
	 */
	editedAt: string | null;
	/**
	 * When the author deleted it, or null while it stands.
	 *
	 * A deleted message still arrives, and it must: it holds its place in the
	 * order, and it is what other people's read markers and the paging cursor
	 * point at. What it does *not* carry is its content — the server empties
	 * `content` and drops `attachment` on the same write, so there is nothing
	 * left for a client to render even by mistake. Show the placeholder, not the
	 * bubble.
	 */
	deletedAt: string | null;
	/**
	 * Every reaction on this message, one entry per emoji, empty when there are
	 * none. Order is the server's and is stable: the emoji that was first used on
	 * this message comes first, so a chip does not jump position as counts change.
	 */
	reactions: ReactionDTO[];
	/** The message this one answers, or null. */
	replyTo: MessageReplyDTO | null;
	/**
	 * The `clientId` the sender asked for — see `SendMessageRequest.clientId`.
	 * Stored as that sender's idempotency key, but exposed only on the immediate
	 * send response and room event; ordinary history pages omit it.
	 *
	 * Every other participant receives it too, and for them it names nothing.
	 * That is the cost of one broadcast to the room rather than one emit per
	 * recipient, and it is cheaper than the alternative.
	 */
	clientId?: string;
}

export interface MessageContextDTO {
	messages: MessageDTO[];
	hasMoreOlder: boolean;
	hasMoreNewer: boolean;
}

export interface MessageEditDTO {
	id: string;
	content: string;
	editedAt: string;
}

/**
 * A message that matched a search, with just enough of its conversation to say
 * where it was.
 *
 * The whole `ConversationDTO` is deliberately not embedded: it carries a
 * participant list and a per-viewer unread count, and a page of thirty results
 * from five conversations would repeat all of that five times over for a line of
 * text and a name.
 */
export interface MessageSearchResultDTO {
	message: MessageDTO;
	conversation: {
		id: string;
		isGroup: boolean;
		/** Null for a direct conversation — the client derives a title from the participants. */
		name: string | null;
		/**
		 * The other people in it, so a direct conversation can be given a name
		 * without a second request. Only ever the people who are in it *now*, which
		 * is a different question from who wrote the matching message — that is on
		 * `message.author`, and it is why the two are separate.
		 */
		participants: UserDTO[];
	};
}

export interface MessageSearchPageDTO {
	results: MessageSearchResultDTO[];
	hasMore: boolean;
}

export interface SavedMessagePageDTO {
	results: MessageSearchResultDTO[];
	hasMore: boolean;
}

// ---- Auth request/response contracts ----
//
// Declared here rather than separately on each side. When these lived only in
// the client and only in the server's Zod schema, adding a required field to
// one left the other compiling happily and failing at runtime with a 400.

export interface RegisterRequest {
	email: string;
	password: string;
	handle: string;
	displayName: string;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface AuthResponse {
	/**
	 * The short-lived access token. Sent as `Authorization: Bearer` on every
	 * request and in the socket handshake.
	 *
	 * Minutes, not days. It is a JWT, so nothing can revoke it once signed —
	 * which is exactly why it must not be the session. The long-lived half that
	 * can be revoked is the refresh token, and it never appears in a response
	 * body: it arrives as a `Set-Cookie` the browser stores itself, `HttpOnly`
	 * so no script on the page — including one smuggled in by an XSS bug — can
	 * read it. A field here would hand it to exactly the script it is meant to
	 * be safe from.
	 */
	token: string;
	user: Pick<CurrentUserDTO, "id" | "email" | "handle" | "displayName">;
}

/**
 * What `POST /auth/refresh` answers with: a new access token. The replacement
 * refresh token is rotated the same way — single use, so a token copied out of
 * the cookie jar stops working the moment the real client refreshes — but it
 * travels the same `Set-Cookie` as everywhere else, never the body.
 */
export interface RefreshTokenResponse {
	token: string;
}

/**
 * Body of `PATCH /users/me`.
 *
 * Both fields are optional and the server requires at least one — a PATCH that
 * changes nothing is a mistake worth reporting, not a no-op to absorb quietly.
 * Sending only the field that changed is also what keeps two tabs from
 * overwriting each other's edit of the other field.
 *
 * `email` is deliberately not here, and never will be: changing it is a two-step
 * flow that only takes effect when a link in the new mailbox is opened, so it
 * cannot be one field of a PATCH that succeeds immediately. See
 * `RequestEmailChangeRequest`.
 */
export interface UpdateProfileRequest {
	// `| undefined` is required, not noise: the server compiles with
	// `exactOptionalPropertyTypes`, under which `displayName?: string` means the
	// key may be absent but must never hold `undefined` — and that is exactly
	// what a Zod `.partial()` produces for a field the client left out.
	displayName?: string | undefined;
	handle?: string | undefined;
	/**
	 * Turning this off hides your read marker from everyone, and everyone's from
	 * you. It sits on the profile PATCH rather than an endpoint of its own because
	 * it is a stored preference like the other two, not an action.
	 */
	readReceiptsEnabled?: boolean | undefined;
	presenceVisibility?: PresenceVisibility | undefined;
}

/**
 * Body of `POST /auth/email` — asks to move the account to a new address.
 *
 * Nothing changes when this returns. The address becomes the account's only once
 * the link mailed to it is opened, because an address nobody has proved they can
 * read must never become a credential.
 *
 * `currentPassword` for the same reason `ChangePasswordRequest` carries one: a
 * token is proof of a past sign-in, and the address on an account is what a
 * password reset is delivered to — whoever changes it can take the account.
 */
export interface RequestEmailChangeRequest {
	newEmail: string;
	currentPassword: string;
}

/** Body of `POST /auth/email/confirm`. The token comes from the link in the new mailbox. */
export interface ConfirmEmailChangeRequest {
	token: string;
}

/**
 * Body of `DELETE /users/me`.
 *
 * A password rather than a confirmation checkbox: this is the one action in the
 * app nothing can undo, and the person at an unlocked laptop holds the token but
 * not the password.
 */
export interface DeleteAccountRequest {
	currentPassword: string;
}

export interface SetParticipantRoleRequest {
	role: ConversationRole;
}

export interface SetGroupInvitePolicyRequest {
	invitePolicy: GroupInvitePolicy;
}

export interface SetThemeRequest {
	theme: ConversationTheme | null;
}

export interface SetQuickReactionRequest {
	emoji: string | null;
}

/**
 * Body of `POST /auth/password`.
 *
 * `currentPassword` is required even though the request is already
 * authenticated: a token is proof of a past sign-in, and this endpoint is the
 * one that decides whether every future one still works. Someone who walks up
 * to an unlocked laptop has the token but not the password.
 */
export interface ChangePasswordRequest {
	currentPassword: string;
	newPassword: string;
}

/**
 * A replacement for the token the caller arrived with.
 *
 * Changing a password ends every session on the account — that is the point of
 * the feature — and the caller's own is one of them. Without this they would be
 * signed out of the tab they are standing in. **Store it**: the old token stops
 * working on its next request, and any socket open at the time is disconnected,
 * so the client has to reconnect with this one.
 */
export interface ChangePasswordResponse {
	token: string;
}

/**
 * Body of `POST /auth/password-reset`.
 *
 * Always answers 204, whether or not the address has an account. Anything else
 * — a different status, a different message, a noticeably different delay — is
 * a way to ask whether someone is registered here.
 */
export interface RequestPasswordResetRequest {
	email: string;
}

/** Body of `POST /auth/password-reset/confirm`. The token comes from the emailed link. */
export interface ResetPasswordRequest {
	token: string;
	newPassword: string;
}

/**
 * Body of `POST /conversations/:id/read`.
 *
 * Carries the message id rather than a timestamp: the client already knows
 * which message is on screen, and a clock it controls is not something the
 * server should trust to decide what has been read.
 */
export interface MarkReadRequest {
	messageId: string;
}

/**
 * Body of `POST /conversations/:conversationId/messages`.
 *
 * Sent as JSON for a text message, or as multipart with the files in an
 * `attachment` field when there are images — in which case `content` is the
 * optional caption for the set. One of the two must carry something: the server
 * rejects a request with neither.
 *
 * The field name stays singular because multipart repeats one field name per
 * file; renaming it would break nothing here and every client at once.
 */
export interface SendMessageRequest {
	content?: string | undefined;
	/**
	 * Sends one of your own saved stickers.
	 *
	 * Mutually exclusive with files and with `content`: a sticker is the whole
	 * message. The server copies the sticker's bytes into a fresh attachment, so
	 * deleting the message never empties the tray.
	 */
	stickerId?: string | undefined;
	/**
	 * The message this one answers.
	 *
	 * The server checks it belongs to the same conversation and refuses it
	 * otherwise — without that, a reply could quote a message out of a
	 * conversation the sender was never in and leak its text.
	 */
	replyToId?: string | undefined;
	forwardOfMessageId?: string | undefined;
	mentionedUserIds?: string[] | undefined;
	/**
	 * The id the sender's optimistic copy is already drawn under.
	 *
	 * Echoed back on the `message:new` broadcast so the sender can recognise its
	 * own draft in the event. Without it the sender briefly renders the message
	 * twice: the broadcast and the HTTP response leave the server together, and
	 * whenever the socket wins the draft and the saved message sit in the thread
	 * side by side until the response arrives to clear the draft away.
	 *
	 * Optional for legacy/non-optimistic clients. The server stores it under a
	 * per-author unique index and interprets a replay as the same logical send.
	 */
	clientId?: string | undefined;
}

/**
 * A page of the sidebar.
 *
 * Pinned conversations are not paged: they are capped per person, so the first
 * page carries all of them and every later page is walking the ordinary tail.
 * A caller therefore pages by the id of the last **unpinned** row it holds.
 */
export interface ConversationPageDTO {
	items: ConversationDTO[];
	hasMore: boolean;
}

export interface ConversationArchiveRequest {
	archived: boolean;
}

export interface ConversationPinRequest {
	pinned: boolean;
}

export interface ConversationMuteRequest {
	until: string | null;
}

/**
 * Body of `PUT /conversations/:conversationId/messages/:messageId/reactions`.
 *
 * A toggle, not an add: sending the emoji you already left removes it. One
 * endpoint rather than a POST and a DELETE, because the client never needs to
 * know which of the two it is doing — the button is the same button.
 */
export interface ToggleReactionRequest {
	emoji: ReactionEmoji;
}

/**
 * Body of `PATCH /conversations/:conversationId/messages/:messageId`.
 *
 * Text only, and required — replacing or removing an image is not an edit but a
 * different message, and allowing it would mean a second upload path with its
 * own membership check. Empty is accepted only on a message that still has an
 * image to stand on its own, exactly as when it was sent: a message has to be
 * something.
 */
export interface EditMessageRequest {
	content: string;
}

/** Body of `POST /conversations/:id/members`. */
export interface AddParticipantRequest {
	userId: string;
}

/** Body of `PATCH /conversations/:id`. Group-only — the server rejects it for a direct conversation. */
export interface RenameConversationRequest {
	name: string;
}

// ---- Socket.io event contracts ----
//
// Wired into the Socket.io server as `Server<ClientToServerEvents, ServerToClientEvents>`
// and into the client as `io<ServerToClientEvents, ClientToServerEvents>`, so a payload
// that does not match fails to compile on both ends instead of arriving malformed.

/** Someone advanced their read marker in a conversation you are in. */
export interface ConversationReadEvent {
	conversationId: string;
	userId: string;
	lastReadMessageId: string;
}

/** Someone started or stopped typing in a conversation you are in. */
export interface TypingEvent {
	conversationId: string;
	userId: string;
	isTyping: boolean;
}

/**
 * The signed-in person blocked or unblocked somebody, from one of their other
 * sessions.
 *
 * Sent to the actor's own room and **nowhere else**. The payload is their own
 * directed row, which is the one block fact they are already allowed to ask for
 * over HTTP — so this adds no information, it only stops a second tab or a phone
 * from offering "Block" for somebody already blocked, or leaving a composer
 * disabled after the block was lifted elsewhere.
 *
 * Emitting the counterpart to the *other* person would be a leak even with
 * `isBlocked: false` in it: the arrival of the event is itself the timing signal
 * that someone just blocked them, which is exactly what `GET /blocks/:id/status`
 * refuses to answer.
 */
export interface BlockChangedEvent {
	/** The other person, not the actor — the actor is whoever the room belongs to. */
	userId: string;
	isBlocked: boolean;
}

/**
 * The signed-in person restricted or unrestricted somebody, from one of their
 * other sessions.
 *
 * Sent to the actor's own room and nowhere else, the rule `BlockChangedEvent`
 * already follows — here it is not merely a privacy preference but the feature
 * working at all: an event reaching the restricted person would be the only way
 * they could learn of it, and its arrival would say so with any payload.
 */
export interface RestrictionChangedEvent {
	/** The other person, not the actor — the actor is whoever the room belongs to. */
	userId: string;
	isRestricted: boolean;
}

/** Someone you share a conversation with connected or dropped their last connection. */
export interface PresenceEvent {
	userId: string;
	isOnline: boolean;
	lastSeenAt: string | null;
}

/**
 * Who is already online, sent once to a socket right after it connects.
 *
 * Without it a client only learns about presence when it *changes*, so everyone
 * who was already online before you opened the app would look offline until
 * they happened to reconnect.
 */
export interface PresenceSnapshotEvent {
	onlineUserIds: string[];
}

/** What the client sends to say it is or is no longer typing. */
export interface TypingSignal {
	conversationId: string;
}

/**
 * Shared conversation state changed — someone was added, left, changed role,
 * renamed the group, or changed its invite policy.
 *
 * Carries only the parts of a conversation that are *not* specific to who is
 * watching. `unreadCount` and `lastMessage` are deliberately absent: they are
 * per-viewer, and one broadcast to a room cannot correctly answer "unread to
 * whom?" for every recipient at once — see `ConversationDTO.unreadCount`.
 * Each participant's own `lastReadMessageId` rides along because that *is* a
 * fact about them, not about the recipient, the same reasoning `conversation:read`
 * already relies on.
 */
export interface ConversationUpdatedEvent {
	conversationId: string;
	name: string | null;
	invitePolicy: GroupInvitePolicy;
	avatarUrl: string | null;
	themeColor: ConversationTheme | null;
	quickReactionEmoji: string | null;
	participants: ParticipantDTO[];
}

/**
 * You were removed from a conversation, or you left it yourself.
 *
 * Sent to your personal room rather than the conversation room: by the time
 * this fires your socket has already been evicted from that room, so it is
 * the only way left to reach you — and it reaches every tab and device you
 * have open, the same as `conversation:new`.
 */
export interface ConversationLeftEvent {
	conversationId: string;
}

export interface ConversationSelfUpdatedEvent {
	conversationId: string;
	isPinned: boolean;
	isArchived: boolean;
	mutedUntil: string | null;
}

/** Events the server pushes down. The client only listens to these. */
export interface ServerToClientEvents {
	"message:new": (message: MessageDTO) => void;
	"message:hidden": (event: { conversationId: string; messageId: string }) => void;
	/**
	 * A message already on screen changed — its author edited it, or deleted it.
	 *
	 * One event for both, carrying the whole message rather than a patch: the
	 * DTO's own `editedAt` / `deletedAt` say which happened, so a client replaces
	 * by id and has nothing to branch on. Two events would need the receiver to
	 * merge fields it did not send, and a delete is precisely the case where a
	 * merge that goes wrong leaves the old text on screen.
	 *
	 * Deliberately does *not* imply the conversation moved: editing a message
	 * from last week must not jump that thread to the top of the sidebar, so the
	 * server leaves `Conversation.updatedAt` alone. Re-read the sidebar for the
	 * preview, not for the ordering.
	 */
	"message:updated": (message: MessageDTO) => void;
	/**
	 * Someone started a conversation that includes you.
	 *
	 * Needed because joining the room is not enough: a brand-new conversation has
	 * no messages, so nothing would ever be broadcast into it and it would not
	 * appear in the sidebar until the other person happened to send something —
	 * or until a reload.
	 *
	 * Sent to the creator too. Their UI already has the conversation from the
	 * HTTP response, so the client de-duplicates by id; one payload for everyone
	 * beats a second code path that only the creator exercises.
	 */
	"conversation:new": (conversation: ConversationDTO) => void;
	"conversation:read": (event: ConversationReadEvent) => void;
	"conversation:updated": (event: ConversationUpdatedEvent) => void;
	"conversation:left": (event: ConversationLeftEvent) => void;
	"conversation:self-updated": (event: ConversationSelfUpdatedEvent) => void;
	"message:pins-updated": (event: { conversationId: string; pinnedMessages: PinnedMessageDTO[] }) => void;
	"typing:update": (event: TypingEvent) => void;
	"block:changed": (event: BlockChangedEvent) => void;
	"restriction:changed": (event: RestrictionChangedEvent) => void;
	"presence:update": (event: PresenceEvent) => void;
	"presence:snapshot": (event: PresenceSnapshotEvent) => void;
}

/**
 * Events the client sends up.
 *
 * Deliberately short, and typing is the only thing on it. Everything that
 * *persists* — sending a message, marking a conversation read — goes over HTTP
 * and comes back to everyone as a server event, so there is one write path to
 * secure and the sender renders from the same event everyone else does.
 *
 * Typing is the exception that proves the rule: it is not written anywhere, it
 * fires several times a sentence, and it is worthless a few seconds later. Put
 * on HTTP it would be a request per keystroke, each with its own round trip and
 * auth check, to update something that expires before it lands.
 */
export interface ClientToServerEvents {
	"typing:start": (signal: TypingSignal) => void;
	"typing:stop": (signal: TypingSignal) => void;
}
