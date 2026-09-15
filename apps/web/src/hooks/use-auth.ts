import type { CurrentUserDTO, RegisterRequest } from "@chatty/shared-types";
import { create } from "zustand";
import { api, clearStoredToken, getStoredToken, NetworkUnavailableError, storeSession } from "@/api/client";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { cacheCurrentUser, clearLocalUserData, readCachedCurrentUser } from "@/lib/local-chat-store";
import { closeSocket } from "@/lib/socket";

interface AuthState {
	currentUser: CurrentUserDTO | null;
	/** True until the stored token has been checked, so routes do not redirect too early. */
	isRestoring: boolean;
	login: (email: string, password: string) => Promise<void>;
	register: (input: RegisterRequest) => Promise<void>;
	/**
	 * Changes the password and keeps this tab signed in.
	 *
	 * Here rather than in the form because it is a session operation, not a
	 * profile one: the server invalidates every token on the account, so the
	 * replacement has to be stored and the socket — which authenticated with the
	 * old one and has just been disconnected by the server — has to be dropped so
	 * the next consumer opens a fresh one. `logout` is in this store for exactly
	 * the same reason.
	 */
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
	/**
	 * Deletes the account and leaves this browser signed out.
	 *
	 * Here for the same reason `changePassword` and `logout` are: the token is
	 * dead the moment the request returns and the socket has been closed by the
	 * server, so the local session has to be torn down too. A form cannot do that
	 * without reaching into storage itself.
	 */
	deleteAccount: (currentPassword: string) => Promise<void>;
	logout: () => void;
	restoreSession: () => Promise<void>;
	/**
	 * Replaces the cached profile after the user changes it themselves.
	 *
	 * Exists because the profile is not only read at sign-in any more: changing
	 * an avatar returns a new `avatarUrl`, and without writing it back here the
	 * header would keep rendering the previous version until the next reload.
	 */
	setCurrentUser: (user: CurrentUserDTO) => void;
}

/**
 * Shared rather than owned by features/auth: the chat screens need to know who
 * "me" is to tell my messages from everyone else's, and features must never
 * import from each other.
 */
export const useAuth = create<AuthState>((set) => ({
	currentUser: null,
	isRestoring: true,

	async login(email, password) {
		const { token } = await api.login({ email, password });
		storeSession(token);
		useBlockedUsers.getState().reset();
		useRestrictedUsers.getState().reset();
		const user = await api.getCurrentUser();
		set({ currentUser: user });
		await cacheCurrentUser(user).catch(() => undefined);
	},

	async register(input) {
		const { token } = await api.register(input);
		storeSession(token);
		useBlockedUsers.getState().reset();
		useRestrictedUsers.getState().reset();
		const user = await api.getCurrentUser();
		set({ currentUser: user });
		await cacheCurrentUser(user).catch(() => undefined);
	},

	setCurrentUser(user) {
		set({ currentUser: user });
		void cacheCurrentUser(user).catch(() => undefined);
	},

	async changePassword(currentPassword, newPassword) {
		const { token } = await api.changePassword({ currentPassword, newPassword });
		storeSession(token);
		// The old socket cannot be reused: the server closed it, and socket.io
		// would reconnect with the token it captured when it was created — the one
		// that no longer works. Dropping it makes the next getSocket() build one
		// with the token just stored.
		closeSocket();
	},

	async deleteAccount(currentPassword) {
		await api.deleteAccount({ currentPassword });
		const userId = useAuth.getState().currentUser?.id;
		// Deliberately the same teardown as `logout`, in the same order, rather
		// than a call to it: this state has to be gone whether or not `logout`
		// keeps doing exactly this, and a failed request above must leave the
		// session untouched.
		clearStoredToken();
		closeSocket();
		useBlockedUsers.getState().reset();
		useRestrictedUsers.getState().reset();
		if (userId) void clearLocalUserData(userId).catch(() => undefined);
		set({ currentUser: null });
	},

	logout() {
		const userId = useAuth.getState().currentUser?.id;
		// Told to the server first, and not awaited. Signing out must not depend on
		// the network — a failed request would otherwise leave somebody looking at
		// a chat they asked to leave — but before this call existed "sign out" only
		// cleared this browser's copy and left the session itself alive for a week.
		// The credential is the refresh-token cookie, sent automatically.
		void api.logout().catch(() => undefined);

		clearStoredToken();
		// The socket authenticated with the old token; leaving it open would keep
		// pushing the previous user's messages into the next user's session.
		closeSocket();
		useBlockedUsers.getState().reset();
		useRestrictedUsers.getState().reset();
		if (userId) void clearLocalUserData(userId).catch(() => undefined);
		set({ currentUser: null });
	},

	async restoreSession() {
		// The access token expires in minutes, so on any reload after a coffee
		// break the stored one is dead. That is a session to restore, not one to
		// throw away — `request` renews it on the 401 this next call gets, from the
		// refresh-token cookie, which this module cannot read to check up front.
		// A stored access token is the one signal available without a round trip;
		// its absence is the ordinary "never signed in" case, and the rare one
		// where it was cleared but the cookie survived costs one extra 401 here.
		if (!getStoredToken()) {
			set({ isRestoring: false });

			return;
		}

		try {
			const user = await api.getCurrentUser();
			set({ currentUser: user, isRestoring: false });
			void cacheCurrentUser(user).catch(() => undefined);
		} catch (error) {
			if (error instanceof NetworkUnavailableError) {
				const cached = await readCachedCurrentUser().catch(() => null);
				if (cached) {
					set({ currentUser: cached, isRestoring: false });

					return;
				}
			}
			// Expired or tampered token — drop it rather than leaving the app in a
			// half-authenticated state where every request 401s.
			clearStoredToken();
			useBlockedUsers.getState().reset();
			useRestrictedUsers.getState().reset();
			set({ currentUser: null, isRestoring: false });
		}
	},
}));
