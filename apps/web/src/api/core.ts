/** The request, token-refresh and session machinery every endpoint group shares. */
import type { MessageDTO, RefreshTokenResponse } from "@chatty/shared-types";
import { UserFacingError } from "@/lib/user-facing-error";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_STORAGE_KEY = "chatty:token";
const SESSION_EXPIRED_KEY = "chatty:session-expired";

/** A request that never reached an HTTP response, so the local session is still valid. */
export class NetworkUnavailableError extends Error {
	// Shown as-is wherever a write fails offline, so it says what to do, not what broke.
	constructor(message = "You're offline. Check your connection and try again.") {
		super(message);
		this.name = "NetworkUnavailableError";
	}
}

/**
 * An HTTP error answer. `hasUserMessage` is true only for a 4xx carrying the
 * server's own message — those are written for people ("That handle is taken").
 * A 5xx or a bodiless proxy error is not, and must never reach the screen.
 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly hasUserMessage: boolean,
	) {
		super(message);
		this.name = "ApiError";
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
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Only `rejected` means the session is over. A refresh that never got an answer,
 * was rate limited, or got a 5xx says nothing about the session: ending it there
 * would sign people out (and clear their unsent messages) every time a train went
 * into a tunnel.
 */
type RefreshOutcome = "renewed" | "rejected" | "unreachable";

/**
 * A refresh that has not answered by now is treated as unreachable. It bounds
 * every caller waiting on it, an upload's 401 retry included.
 */
const REFRESH_TIMEOUT_MS = 15_000;

async function performRefresh(): Promise<RefreshOutcome> {
	let response: Response;
	try {
		response = await fetch(`${API_URL}/auth/refresh`, {
			method: "POST",
			// The credential: the refresh-token cookie set by the last login or
			// refresh. There is no body — a cookie this module cannot read is not
			// something it can leak by accident either.
			credentials: "include",
			signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
		});
	} catch {
		return "unreachable";
	}

	// The server answers a dead or missing session with 401; anything else that
	// is not a success (429, 5xx, a proxy's page) is about this moment, not it.
	if (response.status === 401) return "rejected";
	if (!response.ok) return "unreachable";

	try {
		const session = (await response.json()) as RefreshTokenResponse;
		storeSession(session.token);

		return "renewed";
	} catch {
		// A 2xx that is not our JSON came from something in between (a captive
		// portal, a proxy), not from the auth server deciding anything.
		return "unreachable";
	}
}

function refreshSession(): Promise<RefreshOutcome> {
	refreshInFlight ??= performRefresh().finally(() => {
		refreshInFlight = null;
	});

	return refreshInFlight;
}

/**
 * Renews the session if it can, and answers whether it did.
 *
 * Exported for `lib/socket.ts`: a socket that cannot complete its handshake
 * because the access token expired has no HTTP request to piggyback on, so it
 * asks for the renewal itself.
 */
export async function ensureFreshSession(): Promise<boolean> {
	return (await refreshSession()) === "renewed";
}

/**
 * Settles a 401 that is not a credential check: renew and let the caller retry,
 * end the session only when the server refused the renewal, and otherwise
 * report the outage without touching the session.
 */
async function recoverFromUnauthorized(path: string, method: string): Promise<void> {
	const outcome = await refreshSession();
	if (outcome === "renewed") return;
	if (outcome === "unreachable") throw new NetworkUnavailableError(SERVER_UNREACHABLE_MESSAGE);

	reportUnauthorized(path, method);
	throw new UserFacingError(SESSION_ENDED_MESSAGE);
}

const SERVER_UNREACHABLE_MESSAGE = "Couldn't reach Chatty. Check your connection and try again.";
const SESSION_ENDED_MESSAGE = "Your session has ended. Sign in again.";

/**
 * Thin fetch wrapper: attaches the base URL and Authorization header, and
 * throws on non-2xx so callers can `await` without checking `response.ok`.
 *
 * A 401 is retried once behind a session refresh. `hasRetried` is what stops
 * that being a loop: if the request 401s again with a token minted seconds ago,
 * the problem is not the token's age and no further renewal will help.
 */
export async function request<T>(path: string, options: RequestInit = {}, hasRetried = false): Promise<T> {
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
			await recoverFromUnauthorized(path, method);

			return request<T>(path, options, true);
		}

		if (response.status === 401) reportUnauthorized(path, method);
		// The server's error middleware sends { error, message }; fall back to the
		// status when the body is empty or not JSON (e.g. a proxy returned the error).
		const errorBody = await response.json().catch(() => ({}));
		const serverMessage = typeof errorBody.message === "string" ? errorBody.message : null;
		throw new ApiError(
			serverMessage ?? `Request to ${path} failed with ${response.status}`,
			response.status,
			Boolean(serverMessage) && response.status < 500,
		);
	}

	// A 204 has no body — removing a group member is the first endpoint that
	// answers this way. Calling .json() on an empty body throws, so this has to
	// be checked before every other caller of request<T>() can rely on it.
	if (response.status === 204) return undefined as T;

	return response.json() as Promise<T>;
}

export function get<T>(path: string): Promise<T> {
	return request<T>(path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Field names the server reads files from — see server middlewares/upload-image.ts. */
export const AVATAR_FIELD = "avatar";
export const ATTACHMENT_FIELD = "attachment";
export const FILE_FIELD = "file";
export const VOICE_FIELD = "voice";
export const STICKER_FIELD = "sticker";

/** No upload or response bytes for this long means the connection has stalled. */
const UPLOAD_STALL_MS = 60_000;

function parseJson<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

/**
 * Multipart sends go through XHR because `fetch` cannot report upload progress.
 * That puts them outside `request()`, so this repeats its contract: a 401 renews
 * the session once and resends the same body (same `clientId`, so the server
 * deduplicates), and every outcome — including a proxy's HTML error page or a
 * connection that stops moving — settles the promise, so the composer can never
 * be left pending.
 */
export function uploadMessage(
	conversationId: string,
	body: FormData,
	onProgress: ((percent: number) => void) | undefined,
	interruptedMessage: string,
	hasRetried = false,
): Promise<MessageDTO> {
	const path = `/conversations/${conversationId}/messages`;

	return new Promise<MessageDTO>((resolve, reject) => {
		const upload = new XMLHttpRequest();
		let stallTimer: ReturnType<typeof setTimeout> | undefined;
		const armStallTimer = () => {
			clearTimeout(stallTimer);
			stallTimer = setTimeout(() => upload.abort(), UPLOAD_STALL_MS);
		};
		const fail = (error: Error) => {
			clearTimeout(stallTimer);
			reject(error);
		};

		upload.open("POST", `${API_URL}${path}`);
		const token = getStoredToken();
		if (token) upload.setRequestHeader("Authorization", `Bearer ${token}`);
		upload.upload.addEventListener("progress", (event) => {
			armStallTimer();
			if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
		});
		upload.upload.addEventListener("load", () => onProgress?.(100));
		upload.addEventListener("progress", armStallTimer);
		upload.addEventListener("load", () => {
			clearTimeout(stallTimer);
			const payload = parseJson<MessageDTO & { message?: string }>(upload.responseText || "{}");

			if (upload.status >= 200 && upload.status < 300) {
				if (payload?.id) resolve(payload);
				else fail(new NetworkUnavailableError(interruptedMessage));

				return;
			}

			if (upload.status === 401 && !hasRetried) {
				recoverFromUnauthorized(path, "POST")
					.then(() => uploadMessage(conversationId, body, onProgress, interruptedMessage, true))
					.then(resolve, reject);

				return;
			}

			if (upload.status === 401) reportUnauthorized(path, "POST");
			if (upload.status >= 500 && !payload?.message) {
				fail(new NetworkUnavailableError(SERVER_UNREACHABLE_MESSAGE));

				return;
			}
			fail(new Error(payload?.message ?? `Request to ${path} failed with ${upload.status}`));
		});
		upload.addEventListener("error", () => fail(new NetworkUnavailableError(interruptedMessage)));
		upload.addEventListener("abort", () => fail(new NetworkUnavailableError(interruptedMessage)));
		armStallTimer();
		upload.send(body);
	});
}
