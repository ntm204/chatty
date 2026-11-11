import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { verifyAccessToken, type JwtPayload } from "../lib/access-token.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { recordSocketConnected, recordSocketDisconnected, startSocketSetup } from "../lib/metrics.js";
import { setIO, userRoom, type ChattyServer, type ChattySocket } from "../lib/socket-bus.js";
import { listRealtimeConversationIds } from "../modules/blocks/blocks.service.js";
import { announceConnected, announceDisconnected, conversationRoomsOf } from "./presence.js";
import { registerTypingHandlers } from "./typing.js";

/** Frames below this go uncompressed: typing, presence and read events are smaller than it. */
const SOCKET_COMPRESSION_THRESHOLD_BYTES = 512;

/**
 * Subscribes a socket to one room per conversation the user belongs to.
 *
 * Rooms are derived from the database on every connect rather than kept in a
 * map in memory: an in-memory map desynchronizes the moment a second server
 * process exists, and reconnects would silently stop delivering messages.
 */
async function joinConversationRooms(socket: ChattySocket, userId: string): Promise<void> {
	// The personal room is how services reach this user's live sockets to join or
	// evict them. Joined before the read, so a change committed after the read
	// cannot slip past this socket.
	await socket.join(userRoom(userId));
	const conversationIds = await listRealtimeConversationIds(userId);
	await socket.join(conversationIds);

	// A removal that committed after the read but evicted before the join above
	// found nothing to evict. Reading again after joining catches exactly that:
	// anything committed earlier shows here, anything later evicts through the
	// personal room.
	const currentIds = new Set(await listRealtimeConversationIds(userId));
	await Promise.all(conversationIds.filter((id) => !currentIds.has(id)).map((id) => socket.leave(id)));
}

/**
 * Creates the Socket.io server and authenticates each connection with the same
 * JWT used for HTTP (see middlewares/requireAuth.ts).
 */
export function initSockets(httpServer: HttpServer): ChattyServer {
	const io: ChattyServer = new Server(httpServer, {
		cors: { origin: env.CORS_ORIGIN },
		// HTTP responses are Brotli-compressed; socket frames were the one uncompressed path.
		// Measured on real payloads: a message:new frame shrinks 41% (632 → 376 B) for ~12 µs
		// of CPU. Small frames (typing, presence, reads) stay raw, and no zlib context is kept
		// between messages, so an idle connection costs no extra memory. See ADR 0016.
		perMessageDeflate: {
			threshold: SOCKET_COMPRESSION_THRESHOLD_BYTES,
			serverNoContextTakeover: true,
			clientNoContextTakeover: true,
		},
	});

	io.use((socket, next) => {
		const token = socket.handshake.auth.token as string | undefined;
		if (!token) return next(new Error("Missing auth token"));

		// The same function `requireAuth` uses, not a copy of it. The copy that
		// used to be here missed phase 4's attachment-token guard entirely.
		verifyAccessToken(token)
			.then((userId) => {
				socket.data.userId = userId;
				// Already verified above, so decoding only reads the claim it proved.
				const { exp } = jwt.decode(token) as JwtPayload;
				socket.data.tokenExpiresAt = (exp ?? 0) * 1000;
				next();
			})
			.catch(() => next(new Error("Invalid or expired token")));
	});

	io.on("connection", (socket) => {
		const { userId } = socket.data;
		const stopSetupTimer = startSocketSetup();
		recordSocketConnected();

		// The token is checked only at the handshake, so without this a socket would
		// outlive it — and the session it belonged to — for as long as it stays open.
		// Closing the connection rather than `socket.disconnect()`: socket.io-client
		// never retries after a server-sent disconnect, but does after a dropped
		// connection — and the web client renews its token on the refused handshake
		// and resyncs once back.
		const expiryTimer = setTimeout(() => socket.conn.close(), socket.data.tokenExpiresAt - Date.now());

		// Rooms have to exist before either of the next two steps: typing checks
		// membership against them, and presence uses them as its audience.
		joinConversationRooms(socket, userId)
			.then(async () => {
				registerTypingHandlers(socket);
				await announceConnected(io, socket);
				stopSetupTimer("success");
				logger.info({ userId, socketId: socket.id }, "socket connected");
			})
			.catch((error: unknown) => {
				stopSetupTimer("error");
				// Without rooms this socket receives nothing, so fail loudly rather
				// than leaving the user silently staring at a chat that never updates.
				logger.error({ err: error, userId }, "failed to set up socket");
				socket.disconnect(true);
			});

		// Rooms are snapshotted here, not in "disconnect": by then the socket has
		// already left them, and presence would have no audience to notify.
		let roomsAtDisconnect: string[] = [];
		socket.on("disconnecting", () => {
			roomsAtDisconnect = conversationRoomsOf(socket);
		});

		socket.on("disconnect", (reason) => {
			clearTimeout(expiryTimer);
			recordSocketDisconnected(reason);
			announceDisconnected(io, userId, roomsAtDisconnect)
				.catch((error: unknown) => logger.error({ err: error, userId }, "failed to announce disconnect"))
				.finally(() => logger.info({ userId, socketId: socket.id }, "socket disconnected"));
		});
	});

	setIO(io);

	return io;
}
