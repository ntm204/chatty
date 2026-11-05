import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { blockUser } from "../src/modules/blocks/blocks.service.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import { initSockets } from "../src/sockets/index.js";

/**
 * The socket layer over a real connection.
 *
 * Services get unit tests with a fake io, which proves what they *ask* to
 * broadcast. It cannot prove who actually receives it — room membership,
 * exclusions and the handshake all live above that line, and every bug this file
 * exists for was invisible from below.
 *
 * The first one: a user typing on their phone saw their own laptop announce
 * "Minh is typing…" back at them. `socket.to(room)` excludes the socket that
 * sent the event, not the other sockets belonging to the same person.
 */

let server: Server;
let url: string;
const openSockets: Socket[] = [];

beforeAll(async () => {
	server = createServer(createApp());
	initSockets(server);
	server.listen(0);
	await once(server, "listening");
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
	// Sockets outlive the test that opened them and would keep receiving events
	// into the next one, where the database has already been truncated.
	for (const socket of openSockets.splice(0)) socket.disconnect();
});

afterAll(() => {
	server.close();
});

async function createUser(name: string): Promise<{ id: string; token: string }> {
	// These cases exercise authenticated sockets, not password hashing. Keep
	// fixture setup out of the event-observation budget on slower machines.
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			passwordHash: "not-a-real-hash",
			handle: `${name}_test`,
			displayName: name,
		},
		select: { id: true },
	});
	const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: "15m" });

	return { id: user.id, token };
}

/**
 * Waits for one event on a socket.io-client `Socket`.
 *
 * Not `events.once()` from `node:events`: that function's types require a real
 * `EventEmitter` (`addListener`, `setMaxListeners`, ...), which `Socket` does
 * not implement even though it has a compatible `on`/`off` pair. Written by
 * hand rather than fought with a cast, the same way `nextEvent` below already
 * has to for the same reason.
 */
function onceEvent(socket: Socket, event: string): Promise<void> {
	return new Promise((resolve) => socket.once(event, () => resolve()));
}

/** Connects, and waits until the server has finished putting it in its rooms. */
async function connectAs(token: string): Promise<Socket> {
	const socket = connect(url, { auth: { token } });
	openSockets.push(socket);
	await onceEvent(socket, "connect");
	// The rooms are joined in an async handler after `connect` resolves, and
	// typing is dropped for a conversation the socket is not in yet. Waiting for
	// the presence snapshot is waiting for that handler to have run.
	await onceEvent(socket, "presence:snapshot");

	return socket;
}

/** The next matching event, or null once `ms` passes without one. */
function nextEvent(socket: Socket, event: string, ms = 700): Promise<unknown> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			socket.off(event, listener);
			resolve(null);
		}, ms);

		function listener(payload: unknown) {
			clearTimeout(timer);
			socket.off(event, listener);
			resolve(payload);
		}

		socket.on(event, listener);
	});
}

describe("typing over the socket", () => {
	it("reaches the other participant", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		const conversation = await createConversation(minh.id, { participantIds: [an.id] });

		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "typing:update");
		minhSocket.emit("typing:start", { conversationId: conversation.id });

		expect(await heard).toEqual({ conversationId: conversation.id, userId: minh.id, isTyping: true });
	});

	it("does not reach the typist's own other devices", async () => {
		// The bug this file was created for. Both sockets are the same person, so
		// the laptop must stay silent while the phone types.
		const minh = await createUser("minh");
		const an = await createUser("an");
		const conversation = await createConversation(minh.id, { participantIds: [an.id] });

		const phone = await connectAs(minh.token);
		const laptop = await connectAs(minh.token);

		const heard = nextEvent(laptop, "typing:update");
		phone.emit("typing:start", { conversationId: conversation.id });

		expect(await heard).toBeNull();
	});

	it("relays a stop as well as a start", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		const conversation = await createConversation(minh.id, { participantIds: [an.id] });

		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "typing:update");
		minhSocket.emit("typing:stop", { conversationId: conversation.id });

		expect(await heard).toMatchObject({ isTyping: false });
	});

	it("drops typing aimed at a conversation the sender is not in", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		const binh = await createUser("binh");
		// A conversation Minh has nothing to do with.
		const theirs = await createConversation(an.id, { participantIds: [binh.id] });

		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "typing:update");
		minhSocket.emit("typing:start", { conversationId: theirs.id });

		expect(await heard).toBeNull();
	});

	it("drops typing across a direct block even when both sockets connected first", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		const conversation = await createConversation(minh.id, { participantIds: [an.id] });
		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		await blockUser(an.id, minh.id);
		const heard = nextEvent(anSocket, "typing:update");
		minhSocket.emit("typing:start", { conversationId: conversation.id });

		expect(await heard).toBeNull();
	});

	it("survives a malformed payload", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		await createConversation(minh.id, { participantIds: [an.id] });

		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "typing:update");
		minhSocket.emit("typing:start", { nonsense: true } as never);

		expect(await heard).toBeNull();
		// safeParse rather than parse: a throw here would drop the connection over
		// one bad keystroke event.
		expect(minhSocket.connected).toBe(true);
	});
});

describe("personal conversation updates over the socket", () => {
	it("reaches every device owned by the actor and no other participant", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		const conversation = await createConversation(minh.id, { participantIds: [an.id] });
		const phone = await connectAs(minh.token);
		const laptop = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heardOnPhone = nextEvent(phone, "conversation:self-updated");
		const heardOnLaptop = nextEvent(laptop, "conversation:self-updated");
		const heardByAn = nextEvent(anSocket, "conversation:self-updated");
		const response = await fetch(`${url}/conversations/${conversation.id}/archive`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${minh.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ archived: true }),
		});

		expect(response.status).toBe(200);
		const expected = expect.objectContaining({ conversationId: conversation.id, isArchived: true });
		expect(await heardOnPhone).toEqual(expected);
		expect(await heardOnLaptop).toEqual(expected);
		expect(await heardByAn).toBeNull();
	});
});

describe("presence over the socket", () => {
	it("does not announce presence through a blocked direct conversation after reconnecting", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		await createConversation(minh.id, { participantIds: [an.id] });
		await blockUser(minh.id, an.id);

		const minhSocket = await connectAs(minh.token);
		const heard = nextEvent(minhSocket, "presence:update");
		await connectAs(an.token);

		expect(await heard).toBeNull();
	});

	it("stores and announces last seen when the last connection closes", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		await createConversation(minh.id, { participantIds: [an.id] });
		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "presence:update", 1_500);
		minhSocket.disconnect();
		const event = (await heard) as { userId: string; isOnline: boolean; lastSeenAt: string | null };

		expect(event).toMatchObject({ userId: minh.id, isOnline: false });
		expect(event.lastSeenAt).not.toBeNull();
		const stored = await prisma.user.findUniqueOrThrow({ where: { id: minh.id }, select: { lastSeenAt: true } });
		expect(stored.lastSeenAt?.toISOString()).toBe(event.lastSeenAt);
	});

	it("stores last seen but withholds its timestamp when privacy is nobody", async () => {
		const minh = await createUser("minh");
		const an = await createUser("an");
		await prisma.user.update({ where: { id: minh.id }, data: { presenceVisibility: "NOBODY" } });
		await createConversation(minh.id, { participantIds: [an.id] });
		const minhSocket = await connectAs(minh.token);
		const anSocket = await connectAs(an.token);

		const heard = nextEvent(anSocket, "presence:update", 1_500);
		minhSocket.disconnect();
		const event = await heard;

		expect(event).toEqual({ userId: minh.id, isOnline: false, lastSeenAt: null });
		const stored = await prisma.user.findUniqueOrThrow({ where: { id: minh.id }, select: { lastSeenAt: true } });
		expect(stored.lastSeenAt).not.toBeNull();
	});
});
