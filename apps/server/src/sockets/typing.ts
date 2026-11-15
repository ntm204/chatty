import { z } from "zod";
import { logger } from "../lib/logger.js";
import { userRoom, type ChattySocket } from "../lib/socket-bus.js";
import { prisma } from "../lib/prisma.js";
import { isDirectConversationBlocked } from "../modules/blocks/blocks.service.js";

/**
 * Typing is the one thing a client is allowed to push over the socket, so this
 * is the one place a socket payload is validated. `.safeParse`, not `.parse`,
 * unlike every HTTP boundary in the project: there is no error middleware on
 * this transport, so a throw here would take down the connection over a
 * malformed keystroke event instead of returning a 400.
 */
const typingSignalSchema = z.object({
	conversationId: z.string().min(1),
});

/**
 * How long one database verdict about a conversation is reused for one socket.
 *
 * Typing fires in bursts several times a sentence, and the policy it asks about
 * changes about once in the life of a relationship. A few seconds of reuse is
 * what keeps this handler off the database on the ordinary keystroke while still
 * bounding how long a stale verdict can survive.
 *
 * Both directions of staleness are uneventful. A block prunes the socket's rooms
 * synchronously, so the hash lookup below already refuses before this is
 * consulted; an unblock can leave a cached refusal in place for a few seconds,
 * which costs an indicator that expires on its own anyway.
 */
const POLICY_VERDICT_TTL_MS = 5_000;

/**
 * Relays "X is typing" to the rest of a conversation.
 *
 * The membership check is `socket.rooms`, not a query: the set is derived from
 * the database when the socket connects, extended when a conversation is created
 * for them, and pruned when a block commits. Consulting it is a hash lookup,
 * where a query would be a round trip several times a sentence to announce
 * something that expires in seconds.
 *
 * The check is not optional, though. `socket.to(room)` addresses any room by
 * name, joined or not, so without it anyone could type into a stranger's chat.
 *
 * Behind it sits one database check of the block policy, because a room is
 * delivery bookkeeping rather than authorization and can be briefly stale — a
 * block committing between reconciliation and this keystroke, or a client that
 * kept an old membership across a reconnect. It is cached per conversation for
 * `POLICY_VERDICT_TTL_MS` so that the ordinary keystroke stays a hash lookup,
 * which is what the paragraph above promises.
 */
export function registerTypingHandlers(socket: ChattySocket): void {
	const { userId } = socket.data;
	// Per socket, so it dies with the connection, and bounded by the number of
	// conversations this person actually types in while it is open.
	const verdicts = new Map<string, { isBlocked: boolean; expiresAt: number }>();

	async function isBlocked(conversationId: string): Promise<boolean> {
		const cached = verdicts.get(conversationId);
		if (cached && cached.expiresAt > Date.now()) return cached.isBlocked;

		// Fails closed, and caches that too: a database that cannot answer is not
		// a reason to relay a keystroke into a conversation that may have just
		// been blocked — and caching the refusal is what stops an outage turning
		// every keystroke into another failing query and another log line.
		const isBlockedNow = await isDirectConversationBlocked(userId, conversationId).catch((error: unknown) => {
			logger.warn({ err: error, userId, conversationId }, "typing policy check failed; suppressing the signal");

			return true;
		});
		verdicts.set(conversationId, { isBlocked: isBlockedNow, expiresAt: Date.now() + POLICY_VERDICT_TTL_MS });

		return isBlockedNow;
	}

	let sharing: { isEnabled: boolean; expiresAt: number } | undefined;

	/**
	 * Whether this person shares "is typing…" at all (ADR 0024), cached for the
	 * same few seconds as the block verdict and for the same reason. Fails
	 * closed: an unanswerable preference is not permission to announce.
	 */
	async function isSharingTyping(): Promise<boolean> {
		if (sharing && sharing.expiresAt > Date.now()) return sharing.isEnabled;
		const isEnabled = await prisma.user
			.findUnique({ where: { id: userId }, select: { typingIndicatorsEnabled: true } })
			.then((user) => user?.typingIndicatorsEnabled ?? false)
			.catch(() => false);
		sharing = { isEnabled, expiresAt: Date.now() + POLICY_VERDICT_TTL_MS };

		return isEnabled;
	}

	async function announce(signal: unknown, isTyping: boolean): Promise<void> {
		const parsed = typingSignalSchema.safeParse(signal);
		if (!parsed.success) return;

		const { conversationId } = parsed.data;
		if (!socket.rooms.has(conversationId)) return;
		if (await isBlocked(conversationId)) return;
		// Only the start is withheld: a stop always goes through, so turning the
		// setting off mid-sentence clears an indicator instead of stranding it.
		if (isTyping && !(await isSharingTyping())) return;

		// `socket.to` excludes the socket that sent this — but not the *person*.
		// Their other tabs and devices are in the same conversation room, so
		// without `.except` someone typing on their phone watches their own
		// laptop announce "Minh is typing…" back at them. The personal room
		// holds every socket one user has open, which is exactly the set to
		// leave out; presence uses it for the same reason.
		socket.to(conversationId).except(userRoom(userId)).emit("typing:update", { conversationId, userId, isTyping });
	}

	function relay(isTyping: boolean) {
		return (signal: unknown) => {
			// socket.io neither awaits a handler nor catches what it rejects with,
			// and an unhandled rejection ends the Node process by default. Handing
			// this listener an `async` function directly would make one database
			// blip during one keystroke a way to take down an API instance.
			void announce(signal, isTyping).catch((error: unknown) => {
				logger.warn({ err: error, userId }, "failed to relay a typing signal");
			});
		};
	}

	socket.on("typing:start", relay(true));
	socket.on("typing:stop", relay(false));
}
