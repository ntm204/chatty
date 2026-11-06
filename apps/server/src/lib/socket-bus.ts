import type { ClientToServerEvents, ServerToClientEvents } from "@chatty/shared-types";
import type { Server, Socket } from "socket.io";

/**
 * What the handshake proves about a connection, carried on the socket itself.
 *
 * Stored in Socket.io's own `data` bag rather than as an extra property on the
 * socket object, because `fetchSockets()` — how presence asks the adapter who
 * is connected — returns a remote handle that exposes `data` and nothing
 * custom. A property bolted onto the local socket would be invisible from
 * there, and invisible across processes once a Redis adapter exists.
 */
export interface ChattySocketData {
	userId: string;
	/** When the handshake's access token expires, in ms since the epoch. */
	tokenExpiresAt: number;
}

/** No server-to-server events yet; the slot exists because SocketData follows it. */
type InterServerEvents = Record<string, never>;

export type ChattyServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ChattySocketData>;
export type ChattySocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ChattySocketData>;

/**
 * Name of the room that holds every live socket belonging to one user.
 *
 * A user can be connected from several tabs or devices at once, so "reach this
 * person" means "reach a set of sockets". Defined here, in one place, because
 * the socket layer joins the room and the conversation service addresses it —
 * two spellings that drift apart would fail silently, delivering nothing.
 */
export function userRoom(userId: string): string {
	return `user:${userId}`;
}

/**
 * Holds the single Socket.io server instance so services can emit realtime
 * events without importing `sockets/index.ts` directly — that file registers
 * handlers which call back into services, so importing it from a service would
 * be a circular import.
 *
 * `server.ts` calls `setIO()` once at boot, right after creating the server.
 */
let io: ChattyServer | undefined;

export function setIO(instance: ChattyServer): void {
	io = instance;
}

export function getIO(): ChattyServer {
	if (!io) throw new Error("Socket.io server not initialized yet — was setIO() called in server.ts?");

	return io;
}

/**
 * The transport is intentionally optional for committed account policy writes.
 *
 * A block must not answer 500 after its database transaction committed merely
 * because an HTTP-only test server, a maintenance process or shutdown has no
 * Socket.io instance left to reconcile. Callers that require delivery still use
 * `getIO`; callers applying durable privacy policy may skip its best-effort
 * realtime cleanup and reconnect through the database policy instead.
 */
export function getOptionalIO(): ChattyServer | undefined {
	return io;
}
