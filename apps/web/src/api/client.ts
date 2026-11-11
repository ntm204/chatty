/**
 * The single public entry for the HTTP client. Each endpoint group lives in its
 * own file; callers keep importing `api` (and the session helpers) from here.
 */
import { authApi } from "./auth";
import { conversationsApi } from "./conversations";
import { messagesApi } from "./messages";
import { usersApi } from "./users";

export {
	clearStoredToken,
	ensureFreshSession,
	getStoredToken,
	NetworkUnavailableError,
	setSessionExpiredHandler,
	storeSession,
	wasSessionExpired,
} from "./core";

/**
 * One named method per endpoint rather than raw get/post at the call site, so
 * the URL and its response type are declared once and every screen agrees.
 */
export const api = {
	...authApi,
	...usersApi,
	...conversationsApi,
	...messagesApi,
};
