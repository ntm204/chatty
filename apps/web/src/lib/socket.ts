import type { ClientToServerEvents, ServerToClientEvents } from "@chatty/shared-types";
import { io, type Socket } from "socket.io-client";
import { ensureFreshSession, getStoredToken } from "@/api/client";

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type ChattySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ChattySocket | undefined;

/**
 * The app's single socket connection, authenticated with the same token as REST
 * calls (the server verifies `handshake.auth.token` — see server/sockets/index.ts).
 *
 * Created lazily so it reads the token *after* login rather than at module load,
 * when there is nothing stored yet.
 */
export function getSocket(): ChattySocket {
	if (!socket) {
		socket = io(SOCKET_URL, {
			/**
			 * A callback, not an object, and that is load-bearing since access
			 * tokens started expiring in minutes. socket.io reads an object form
			 * once, when the socket is created, and would then reconnect forever
			 * with the token it captured — which is guaranteed to be stale after
			 * the first renewal. The callback is read on every attempt.
			 */
			auth: (callback: (data: { token: string | null }) => void) => callback({ token: getStoredToken() }),
			/**
			 * WebSocket only, and this is a deployment decision rather than a
			 * preference.
			 *
			 * Socket.io's default is to open with HTTP long-polling and upgrade
			 * afterwards. Long-polling is a *sequence* of requests that must all
			 * reach the same process, and behind two instances without session
			 * affinity they do not: the handshake half-completes against one and the
			 * next poll lands on the other, which knows nothing about the session.
			 * It shows up as a reconnect loop that only appears once you scale out,
			 * and never on one machine.
			 *
			 * The Redis adapter does not fix this. It shares *rooms* between
			 * processes so a broadcast reaches everyone; it says nothing about which
			 * process a given request arrives at.
			 *
			 * The cost is any network that blocks WebSocket upgrades — a corporate
			 * proxy, an ancient captive portal — where this client cannot connect at
			 * all rather than falling back. That is the trade: a clear failure in a
			 * rare environment, over an intermittent one everywhere.
			 */
			transports: ["websocket"],
		});

		/**
		 * A refused handshake is usually an expired access token, and the socket
		 * has no HTTP response to piggyback the renewal on: nothing else may be
		 * happening on a tab that was left open overnight, so without this it
		 * would retry with the same dead token until somebody clicked something.
		 *
		 * `ensureFreshSession` is single-flighted and returns false when there is
		 * nothing to renew with, so a genuinely ended session settles into
		 * socket.io's own backoff rather than a refresh loop.
		 */
		socket.on("connect_error", () => {
			void ensureFreshSession();
		});
	}

	return socket;
}

/**
 * Drops the connection and forgets it, so the next `getSocket()` re-authenticates
 * with whatever token is stored then. Called on logout: a socket opened with the
 * previous user's token would keep delivering their messages after a switch.
 */
export function closeSocket(): void {
	socket?.disconnect();
	socket = undefined;
}

/** Reauthenticate the current account without stranding the mounted chat's listeners. */
export function reconnectSocket(): void {
	// The auth callback reads the replacement token on this connection attempt.
	// Keeping the instance lets existing subscriptions and reconnect recovery run.
	socket?.disconnect().connect();
}
