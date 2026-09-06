import type {
	AddParticipantRequest,
	AttachmentKind,
	AttachmentPageDTO,
	AuthResponse,
	ChangePasswordRequest,
	ChangePasswordResponse,
	ConfirmEmailChangeRequest,
	ConversationDTO,
	ConversationPageDTO,
	ConversationSelfUpdatedEvent,
	ConversationReadEvent,
	ConversationTheme,
	CurrentUserDTO,
	DeleteAccountRequest,
	EditMessageRequest,
	LoginRequest,
	MarkReadRequest,
	MessageDTO,
	MessageContextDTO,
	MessageEditDTO,
	MessageSearchPageDTO,
	MessageLinkPageDTO,
	PinnedMessageDTO,
	ReactionEmoji,
	RefreshTokenResponse,
	RegisterRequest,
	RenameConversationRequest,
	RequestEmailChangeRequest,
	RequestPasswordResetRequest,
	ResetPasswordRequest,
	StickerDTO,
	SetGroupInvitePolicyRequest,
	SetParticipantRoleRequest,
	SetThemeRequest,
	ConversationVaultSummaryDTO,
	ToggleReactionRequest,
	UpdateProfileRequest,
	BlockStatusDTO,
	BlockedUsersPageDTO,
	RestrictedUsersPageDTO,
	RestrictionStatusDTO,
	UserDTO,
} from "@chatty/shared-types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_STORAGE_KEY = "chatty:token";
const SESSION_EXPIRED_KEY = "chatty:session-expired";

/** A request that never reached an HTTP response, so the local session is still valid. */
export class NetworkUnavailableError extends Error {
	constructor(message = "The network is unavailable") {
		super(message);
		this.name = "NetworkUnavailableError";
	}
}

export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Stores the access token. Just the one now — the refresh token that renews it
 * arrives as an `HttpOnly` cookie the server set alongside this response and
 * this module never sees, which is the entire point: nothing here can read it,
 * so nothing an attacker runs through an XSS bug can either.
 */
export function storeSession(token: string): void {
	localStorage.setItem(TOKEN_STORAGE_KEY, token);
	// There is a session again, so "your session ended" has stopped being true.
	// Cleared here rather than when the notice is read — see `wasSessionExpired`.
	sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}

export function clearStoredToken(): void {
	localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Called on any 401 that means "this session is dead" rather than "wrong
 * password". Registered by `useAuth` (which owns the teardown) instead of
 * imported from it, because this module is imported *by* `useAuth` and the
 * other direction would be a cycle.
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void): void {
	onSessionExpired = handler;
}

/**
 * Whether a 401 on this request is an answer about the *credentials in the
 * body* — a wrong password on login, on a password change, on account deletion
 * — and must reach the form that asked, not sign the user out. Everywhere else
 * a 401 can only mean the token died, and every caller would otherwise handle
 * that separately or not at all. Exact paths, not prefixes: `/users/me/avatar`
 * and `/auth/password-reset` carry no password to be wrong about.
 */
function isCredentialFailure(path: string, method: string): boolean {
	// `/users/me` is only a credential check when deleting the account (the body
	// carries the password); reading or patching the profile proves nothing.
	if (path === "/users/me") return method === "DELETE";

	return path === "/auth/login" || path === "/auth/register" || path === "/auth/password" || path === "/auth/email";
}

function reportUnauthorized(path: string, method: string): void {
	if (isCredentialFailure(path, method)) return;
	// The login screen reads this once, so "you were signed out" has a stated
	// reason instead of looking like the app forgot who you are.
	sessionStorage.setItem(SESSION_EXPIRED_KEY, "true");
	onSessionExpired?.();
}

/**
 * Whether the last sign-out was a session expiring rather than a choice.
 *
 * A **pure read**. It used to read and clear in one call, which was wrong in a
 * way only running the app showed: React's StrictMode double-invokes a
 * `useState` lazy initialiser in development, so the first call consumed the
 * flag and the second — whose result React keeps — returned false. The notice
 * never appeared. The flag is cleared by `storeSession` instead, because
 * signing in again is exactly when it stops being true.
 */
export function wasSessionExpired(): boolean {
	return sessionStorage.getItem(SESSION_EXPIRED_KEY) === "true";
}

/**
 * The one refresh allowed to be in flight at a time.
 *
 * Single-flighting this is not an optimisation, it is the whole thing working.
 * An expired access token 401s every request the screen made at once, and the
 * server rotates a refresh token on use — so five parallel refreshes would mean
 * one success and four "invalid session" errors, and the client would sign
 * itself out at the exact moment it had just successfully renewed.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
	try {
		const response = await fetch(`${API_URL}/auth/refresh`, {
			method: "POST",
			// The credential: the refresh-token cookie set by the last login or
			// refresh. There is no body any more — a stolen response could once be
			// replayed by reading it out of client-side storage, and a cookie this
			// module cannot read is not something it can leak by accident either.
			credentials: "include",
		});

		if (!response.ok) return false;

		const session = (await response.json()) as RefreshTokenResponse;
		storeSession(session.token);

		return true;
	} catch {
		// A network failure is not an expired session, and treating it as one
		// would sign people out every time their train went into a tunnel. The
		// caller reports the original request's failure instead.
		return false;
	}
}

/**
 * Renews the session if it can, and answers whether it did.
 *
 * Exported for `lib/socket.ts`: a socket that cannot complete its handshake
 * because the access token expired has no HTTP request to piggyback on, so it
 * asks for the renewal itself.
 */
export function ensureFreshSession(): Promise<boolean> {
	refreshInFlight ??= performRefresh().finally(() => {
		refreshInFlight = null;
	});

	return refreshInFlight;
}

/**
 * Thin fetch wrapper: attaches the base URL and Authorization header, and
 * throws on non-2xx so callers can `await` without checking `response.ok`.
 *
 * A 401 is retried once behind a session refresh. `hasRetried` is what stops
 * that being a loop: if the request 401s again with a token minted seconds ago,
 * the problem is not the token's age and no further renewal will help.
 */
async function request<T>(path: string, options: RequestInit = {}, hasRetried = false): Promise<T> {
	const token = getStoredToken();
	// FormData sets its own Content-Type, and it has to: the header carries the
	// multipart boundary the browser generated. Declaring JSON over the top of it
	// makes the body unparseable on the server.
	const isFormData = options.body instanceof FormData;
	let response: Response;
	try {
		response = await fetch(`${API_URL}${path}`, {
			...options,
			// The refresh-token cookie is `path: "/auth"` and `HttpOnly`, so this is
			// what lets the browser attach it on `/auth/refresh` and `/auth/logout`
			// and store the one a login or a refresh sends back — every other request
			// simply has no matching cookie to send.
			credentials: "include",
			headers: {
				...(isFormData ? {} : { "Content-Type": "application/json" }),
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...options.headers,
			},
		});
	} catch {
		// No status means there was no server answer. Keeping this distinct from a
		// 401 lets startup use a local snapshot without accepting an invalid token.
		throw new NetworkUnavailableError();
	}

	if (!response.ok) {
		const method = options.method ?? "GET";

		if (response.status === 401 && !hasRetried && !isCredentialFailure(path, method)) {
			// The ordinary case now that access tokens last minutes: renew and go
			// again, so an expiry is invisible rather than an error on screen.
			if (await ensureFreshSession()) return request<T>(path, options, true);
		}

		if (response.status === 401) reportUnauthorized(path, method);
		// The server's error middleware sends { error, message }; fall back to the
		// status when the body is empty or not JSON (e.g. a proxy returned the error).
		const errorBody = await response.json().catch(() => ({}));
		throw new Error(errorBody.message ?? `Request to ${path} failed with ${response.status}`);
	}

	// A 204 has no body — removing a group member is the first endpoint that
	// answers this way. Calling .json() on an empty body throws, so this has to
	// be checked before every other caller of request<T>() can rely on it.
	if (response.status === 204) return undefined as T;

	return response.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
	return request<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Field names the server reads files from — see server middlewares/upload-image.ts. */
const AVATAR_FIELD = "avatar";
const ATTACHMENT_FIELD = "attachment";
const FILE_FIELD = "file";
const VOICE_FIELD = "voice";
const STICKER_FIELD = "sticker";

function uploadMessage(
	conversationId: string,
	body: FormData,
	onProgress: ((percent: number) => void) | undefined,
	interruptedMessage: string,
): Promise<MessageDTO> {
	const path = `/conversations/${conversationId}/messages`;

	return new Promise<MessageDTO>((resolve, reject) => {
		const upload = new XMLHttpRequest();
		upload.open("POST", `${API_URL}${path}`);
		const token = getStoredToken();
		if (token) upload.setRequestHeader("Authorization", `Bearer ${token}`);
		upload.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
		});
		upload.addEventListener("load", () => {
			if (upload.status >= 200 && upload.status < 300) {
				resolve(JSON.parse(upload.responseText) as MessageDTO);

				return;
			}
			if (upload.status === 401) reportUnauthorized(path, "POST");
			const errorBody = JSON.parse(upload.responseText || "{}") as { message?: string };
			reject(new Error(errorBody.message ?? `Request to ${path} failed with ${upload.status}`));
		});
		upload.addEventListener("error", () => reject(new NetworkUnavailableError(interruptedMessage)));
		upload.send(body);
	});
}

/**
 * One named method per endpoint rather than raw get/post at the call site, so
 * the URL and its response type are declared once and every screen agrees.
 */
export const api = {
	register(input: RegisterRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/register", input);
	},

	login(input: LoginRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/login", input);
	},

	getCurrentUser(): Promise<CurrentUserDTO> {
		return get<CurrentUserDTO>("/users/me");
	},

	/**
	 * Changes your own display name, handle, or both, and returns the refreshed
	 * profile. Send only what changed — the server rejects a body with neither.
	 */
	updateProfile(input: UpdateProfileRequest): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me", { method: "PATCH", body: JSON.stringify(input) });
	},

	/**
	 * Sets a new password and returns a replacement token.
	 *
	 * The replacement is not optional. Changing a password ends every session on
	 * the account, the caller's included, so the token this request was made with
	 * stops working the moment it returns. `useAuth.changePassword` is what
	 * stores it and reopens the socket — call that rather than this.
	 */
	changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse> {
		return post<ChangePasswordResponse>("/auth/password", input);
	},

	/**
	 * Asks for a reset link. Answers 204 whether or not the address has an
	 * account, so a caller learns nothing about who is registered — which means
	 * the UI must not claim the mail was sent, only that it would have been.
	 */
	requestPasswordReset(input: RequestPasswordResetRequest): Promise<void> {
		return post<void>("/auth/password-reset", input);
	},

	/** Redeems a link from the email. One use, one hour. */
	resetPassword(input: ResetPasswordRequest): Promise<void> {
		return post<void>("/auth/password-reset/confirm", input);
	},

	/**
	 * Asks to move the account to a new address.
	 *
	 * **Nothing has changed when this resolves.** A link goes to the new address
	 * and the account moves only once it is opened, so the UI must say "check that
	 * inbox" rather than "email updated" — and the cached profile must not be
	 * touched. The old address is warned at the same time.
	 */
	requestEmailChange(input: RequestEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email", input);
	},

	/** Redeems the link from the new mailbox. One use, one hour, no session required. */
	confirmEmailChange(input: ConfirmEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email/confirm", input);
	},

	/**
	 * Deletes the signed-in account, permanently.
	 *
	 * The token this was sent with is dead on arrival of the response, so the
	 * caller has to clear it — `useAuth.deleteAccount` is what does that and drops
	 * the socket. Call that rather than this.
	 */
	deleteAccount(input: DeleteAccountRequest): Promise<void> {
		return request<void>("/users/me", { method: "DELETE", body: JSON.stringify(input) });
	},

	/**
	 * Ends this session on the server.
	 *
	 * Unauthenticated by design — the refresh-token cookie is the credential — so
	 * it still works when the access token has already expired, which is exactly
	 * when somebody closing a laptop needs it to.
	 */
	logout(): Promise<void> {
		return request<void>("/auth/logout", { method: "POST" });
	},

	/**
	 * Sends one of your own saved stickers.
	 *
	 * Its own method rather than an argument on `sendMessage`, because a sticker
	 * is the whole message — the server refuses it alongside text or files, and a
	 * shared signature would invite exactly that call.
	 */
	sendSticker(conversationId: string, stickerId: string, replyToId?: string): Promise<MessageDTO> {
		return post<MessageDTO>(`/conversations/${conversationId}/messages`, {
			stickerId,
			...(replyToId ? { replyToId } : {}),
		});
	},

	listStickers(): Promise<StickerDTO[]> {
		return get<StickerDTO[]>("/stickers");
	},

	addSticker(file: File): Promise<StickerDTO> {
		const body = new FormData();
		body.append(STICKER_FIELD, file);

		return request<StickerDTO>("/stickers", { method: "POST", body });
	},

	removeSticker(stickerId: string): Promise<void> {
		return request<void>(`/stickers/${stickerId}`, { method: "DELETE" });
	},

	searchUsers(query: string): Promise<UserDTO[]> {
		return get<UserDTO[]>(`/users?query=${encodeURIComponent(query)}`);
	},

	/** A bounded page, walked by the Blocked users panel in account settings. */
	listBlockedUsers(before?: string): Promise<BlockedUsersPageDTO> {
		return get<BlockedUsersPageDTO>(`/blocks${before ? `?before=${encodeURIComponent(before)}` : ""}`);
	},

	/** Only the caller's own decision — the reverse direction remains private. */
	getBlockStatus(userId: string): Promise<BlockStatusDTO> {
		return get<BlockStatusDTO>(`/blocks/${userId}/status`);
	},

	// PUT, so blocking somebody already blocked is the same request twice and
	// answers the same way — the client never has to know which it is sending.
	blockUser(userId: string): Promise<void> {
		return request<void>(`/blocks/${userId}`, { method: "PUT" });
	},

	unblockUser(userId: string): Promise<void> {
		return request<void>(`/blocks/${userId}`, { method: "DELETE" });
	},

	/** A bounded page, walked by the Restricted people panel in account settings. */
	listRestrictedUsers(before?: string): Promise<RestrictedUsersPageDTO> {
		return get<RestrictedUsersPageDTO>(`/restrictions${before ? `?before=${encodeURIComponent(before)}` : ""}`);
	},

	/** Only the caller's own decision — the reverse direction remains private. */
	getRestrictionStatus(userId: string): Promise<RestrictionStatusDTO> {
		return get<RestrictionStatusDTO>(`/restrictions/${userId}/status`);
	},

	// PUT, so restricting somebody already restricted is the same request twice
	// and answers the same way — the client never has to know which it is sending.
	restrictUser(userId: string): Promise<void> {
		return request<void>(`/restrictions/${userId}`, { method: "PUT" });
	},

	unrestrictUser(userId: string): Promise<void> {
		return request<void>(`/restrictions/${userId}`, { method: "DELETE" });
	},

	/**
	 * A page of the sidebar. Pinned rows are capped server-side and all arrive on
	 * the first page, so `before` is always the id of the last *unpinned* row.
	 */
	listConversations(isArchived = false, before?: string): Promise<ConversationPageDTO> {
		const params = new URLSearchParams();
		if (isArchived) params.set("archived", "true");
		if (before) params.set("before", before);
		const query = params.toString();

		return get<ConversationPageDTO>(`/conversations${query ? `?${query}` : ""}`);
	},

	/** One row, for a conversation that got activity before the sidebar paged to it. */
	getConversation(conversationId: string): Promise<ConversationDTO> {
		return get<ConversationDTO>(`/conversations/${conversationId}`);
	},

	setConversationArchived(conversationId: string, archived: boolean): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/archive`, {
			method: "PUT",
			body: JSON.stringify({ archived }),
		});
	},

	setConversationPinned(conversationId: string, pinned: boolean): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/pin`, {
			method: "PUT",
			body: JSON.stringify({ pinned }),
		});
	},

	setConversationMuted(conversationId: string, until: string | null): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/mute`, {
			method: "PUT",
			body: JSON.stringify({ until }),
		});
	},

	/** Shared with everyone in the conversation, not just the caller — see ADR 0022. */
	setConversationNickname(conversationId: string, userId: string, nickname: string | null): Promise<ConversationDTO> {
		return request<ConversationDTO>(`/conversations/${conversationId}/members/${userId}/nickname`, {
			method: "PUT",
			body: JSON.stringify({ nickname }),
		});
	},

	setConversationTheme(conversationId: string, theme: ConversationTheme | null): Promise<ConversationDTO> {
		const body: SetThemeRequest = { theme };

		return request<ConversationDTO>(`/conversations/${conversationId}/theme`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	/** Group-only; admin-gated. Returns the refreshed conversation, whose `avatarUrl` carries a new version. */
	uploadConversationAvatar(conversationId: string, file: File): Promise<ConversationDTO> {
		const body = new FormData();
		body.append(AVATAR_FIELD, file);

		return request<ConversationDTO>(`/conversations/${conversationId}/avatar`, { method: "POST", body });
	},

	deleteConversationAvatar(conversationId: string): Promise<ConversationDTO> {
		return request<ConversationDTO>(`/conversations/${conversationId}/avatar`, { method: "DELETE" });
	},

	createConversation(participantIds: string[], name?: string): Promise<ConversationDTO> {
		return post<ConversationDTO>("/conversations", name ? { participantIds, name } : { participantIds });
	},

	/**
	 * Returns messages newest-first, so `limit` yields the most recent page.
	 * Pass `before` — the id of the oldest message already held — to walk further
	 * back. The cursor message itself is excluded.
	 */
	listMessages(
		conversationId: string,
		options: { limit: number; before?: string; after?: string },
	): Promise<MessageDTO[]> {
		const params = new URLSearchParams({ limit: String(options.limit) });
		if (options.before) params.set("before", options.before);
		if (options.after) params.set("after", options.after);

		return get<MessageDTO[]>(`/conversations/${conversationId}/messages?${params.toString()}`);
	},

	getMessageContext(conversationId: string, messageId: string, limit = 50): Promise<MessageContextDTO> {
		return get<MessageContextDTO>(
			`/conversations/${conversationId}/messages/${messageId}/context?limit=${String(limit)}`,
		);
	},

	listMessageEdits(conversationId: string, messageId: string): Promise<MessageEditDTO[]> {
		return get<MessageEditDTO[]>(`/conversations/${conversationId}/messages/${messageId}/edits`);
	},

	hideMessage(conversationId: string, messageId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/messages/${messageId}/me`, { method: "DELETE" });
	},

	/**
	 * Sends a message, with any number of images.
	 *
	 * Same endpoint either way — JSON when it is only text, multipart when there
	 * are files. One write path rather than two, so there is one place where
	 * membership is checked and one broadcast everyone renders from.
	 *
	 * There is no `onProgress` here, where `sendFile` and `sendVoice` both have
	 * one. Phase 29 traded the progress bar for the picture itself, held at 60%
	 * until the server has it, so the only caller had been passing `undefined`
	 * ever since — a hole in the argument list that every future parameter would
	 * have had to be counted past.
	 */
	sendMessage(
		conversationId: string,
		content: string,
		attachments: File[] = [],
		replyToId?: string,
		mentionedUserIds: string[] = [],
		clientId?: string,
	): Promise<MessageDTO> {
		const path = `/conversations/${conversationId}/messages`;
		if (attachments.length === 0) {
			return post<MessageDTO>(path, {
				content,
				...(replyToId ? { replyToId } : {}),
				...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
				...(clientId ? { clientId } : {}),
			});
		}

		const body = new FormData();
		// The same field name once per file: that is how multipart carries a list,
		// and why the server's field stayed singular when the column became many.
		for (const attachment of attachments) body.append(ATTACHMENT_FIELD, attachment);
		// Omitted rather than sent empty: an image with no caption is a message
		// with no text, and the server trims what it gets either way.
		if (content) body.append("content", content);
		// Multer puts non-file fields on `req.body`, so the same Zod schema reads
		// this whether the message arrived as JSON or as multipart.
		if (replyToId) body.append("replyToId", replyToId);
		if (mentionedUserIds.length > 0) body.append("mentionedUserIds", JSON.stringify(mentionedUserIds));
		if (clientId) body.append("clientId", clientId);

		return new Promise<MessageDTO>((resolve, reject) => {
			const upload = new XMLHttpRequest();
			upload.open("POST", `${API_URL}${path}`);
			const token = getStoredToken();

			if (token) upload.setRequestHeader("Authorization", `Bearer ${token}`);
			upload.addEventListener("load", () => {
				if (upload.status >= 200 && upload.status < 300) {
					resolve(JSON.parse(upload.responseText) as MessageDTO);

					return;
				}

				// The one request that does not go through `request()` still has to
				// report a dead session, or an expired token during an image send
				// would strand the user on a composer that only ever errors.
				if (upload.status === 401) reportUnauthorized(path, "POST");
				const errorBody = JSON.parse(upload.responseText || "{}") as { message?: string };
				reject(new Error(errorBody.message ?? `Request to ${path} failed with ${upload.status}`));
			});
			upload.addEventListener("error", () =>
				reject(new NetworkUnavailableError("The image upload was interrupted")),
			);
			upload.send(body);
		});
	},

	sendFile(
		conversationId: string,
		file: File,
		content = "",
		onProgress?: (percent: number) => void,
		replyToId?: string,
	): Promise<MessageDTO> {
		const body = new FormData();
		body.append(FILE_FIELD, file);
		if (content) body.append("content", content);
		if (replyToId) body.append("replyToId", replyToId);

		return uploadMessage(conversationId, body, onProgress, "The file upload was interrupted");
	},

	sendVoice(conversationId: string, recording: Blob, onProgress?: (percent: number) => void): Promise<MessageDTO> {
		const body = new FormData();
		body.append(VOICE_FIELD, recording, "voice-message");

		return uploadMessage(conversationId, body, onProgress, "The voice upload was interrupted");
	},

	forwardMessage(conversationId: string, sourceMessageId: string): Promise<MessageDTO> {
		return post<MessageDTO>(`/conversations/${conversationId}/messages`, { forwardOfMessageId: sourceMessageId });
	},

	listConversationMedia(
		conversationId: string,
		kind: AttachmentKind,
		limit = 40,
		before?: string,
	): Promise<AttachmentPageDTO> {
		const params = new URLSearchParams({ kind, limit: String(limit) });
		if (before) params.set("before", before);

		return get<AttachmentPageDTO>(`/conversations/${conversationId}/media?${params.toString()}`);
	},

	listConversationLinks(conversationId: string, limit = 40, before?: string): Promise<MessageLinkPageDTO> {
		const params = new URLSearchParams({ limit: String(limit) });
		if (before) params.set("before", before);

		return get<MessageLinkPageDTO>(`/conversations/${conversationId}/links?${params.toString()}`);
	},

	/** What each category in the details panel holds, before any of them is opened. */
	getConversationVaultSummary(conversationId: string): Promise<ConversationVaultSummaryDTO> {
		return get<ConversationVaultSummaryDTO>(`/conversations/${conversationId}/vault-summary`);
	},

	pinMessage(conversationId: string, messageId: string): Promise<PinnedMessageDTO[]> {
		return request<PinnedMessageDTO[]>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
			method: "PUT",
		});
	},

	unpinMessage(conversationId: string, messageId: string): Promise<PinnedMessageDTO[]> {
		return request<PinnedMessageDTO[]>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
			method: "DELETE",
		});
	},

	/**
	 * Finds messages across every conversation you are in.
	 *
	 * Not scoped to one conversation on purpose — the point is not knowing which
	 * one the answer is in. Each result carries enough of its conversation to be
	 * labelled without a second request.
	 *
	 * Two characters minimum, enforced by the server: a one-character search
	 * matches most of the table and is never what anyone meant.
	 */
	searchMessages(
		query: string,
		limit = 20,
		conversationId?: string,
		before?: string,
		beforeId?: string,
	): Promise<MessageSearchPageDTO> {
		const params = new URLSearchParams({ query, limit: String(limit) });
		if (conversationId) params.set("conversationId", conversationId);
		if (before) params.set("before", before);
		if (beforeId) params.set("beforeId", beforeId);

		return get<MessageSearchPageDTO>(`/search/messages?${params.toString()}`);
	},

	/**
	 * Rewrites the text of a message you wrote. Only the author may, and only
	 * while it stands — a deleted message is refused rather than restored.
	 *
	 * Like `sendMessage`, the returned message is not what puts it on screen: the
	 * server broadcasts `message:updated` to everyone including the editor, so
	 * one code path renders the change for all of them.
	 */
	editMessage(conversationId: string, messageId: string, content: string): Promise<MessageDTO> {
		const body: EditMessageRequest = { content };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},

	/**
	 * Deletes a message you wrote, and its image with it.
	 *
	 * Returns the tombstone rather than nothing: the message keeps its place in
	 * the conversation with its content emptied, which is what the list renders
	 * as "This message was deleted". Deleting twice is not an error.
	 */
	deleteMessage(conversationId: string, messageId: string): Promise<MessageDTO> {
		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" });
	},

	/**
	 * Sets your one reaction on this message, or takes it off if it is already this emoji.
	 *
	 * One call for both, so the caller never tracks which it is doing — the same
	 * button does both, and a client that decided for itself would disagree with
	 * the database the moment the same account reacted from a second tab.
	 *
	 * Like the other message writes, the response is not what renders it: the
	 * server broadcasts `message:updated` with the whole reaction list.
	 */
	toggleReaction(conversationId: string, messageId: string, emoji: ReactionEmoji): Promise<MessageDTO> {
		const body: ToggleReactionRequest = { emoji };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	/**
	 * Replaces the signed-in user's avatar. Returns the refreshed profile, whose
	 * `avatarUrl` carries a new version — assigning that to the store is what
	 * makes the picture change on screen rather than staying cached.
	 */
	uploadAvatar(file: File): Promise<CurrentUserDTO> {
		const body = new FormData();
		body.append(AVATAR_FIELD, file);

		return request<CurrentUserDTO>("/users/me/avatar", { method: "POST", body });
	},

	deleteAvatar(): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me/avatar", { method: "DELETE" });
	},

	/**
	 * Moves the read marker to `messageId`.
	 *
	 * The response says where the marker actually ended up, which is not always
	 * where it was asked to go — the server refuses to move one backwards.
	 */
	markConversationRead(conversationId: string, messageId: string): Promise<ConversationReadEvent> {
		const body: MarkReadRequest = { messageId };

		return post<ConversationReadEvent>(`/conversations/${conversationId}/read`, body);
	},

	/**
	 * Adds someone to a group. Returns the conversation as seen by the caller —
	 * everyone else, including the new member, learns about it from the
	 * `conversation:new` / `conversation:updated` socket events instead.
	 */
	addParticipant(conversationId: string, userId: string): Promise<ConversationDTO> {
		const body: AddParticipantRequest = { userId };

		return post<ConversationDTO>(`/conversations/${conversationId}/members`, body);
	},

	/**
	 * Removes someone from a group, or — pass your own id — leaves it. No
	 * return value: the server answers 204 and the UI updates from
	 * `conversation:updated` / `conversation:left` once the socket event lands,
	 * the same write-over-HTTP-render-over-socket split used everywhere else.
	 */
	removeParticipant(conversationId: string, userId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
	},

	setParticipantRole(
		conversationId: string,
		userId: string,
		role: SetParticipantRoleRequest["role"],
	): Promise<ConversationDTO> {
		const body: SetParticipantRoleRequest = { role };

		return request<ConversationDTO>(`/conversations/${conversationId}/members/${userId}/role`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	setGroupInvitePolicy(
		conversationId: string,
		invitePolicy: SetGroupInvitePolicyRequest["invitePolicy"],
	): Promise<ConversationDTO> {
		const body: SetGroupInvitePolicyRequest = { invitePolicy };

		return request<ConversationDTO>(`/conversations/${conversationId}/invite-policy`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	renameConversation(conversationId: string, name: string): Promise<ConversationDTO> {
		const body: RenameConversationRequest = { name };

		return request<ConversationDTO>(`/conversations/${conversationId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},
};
