import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { installFakeIO } from "./fake-io.js";

interface SignedInUser {
	id: string;
	token: string;
}
let server: Server;
let baseUrl: string;

beforeAll(async () => {
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
	installFakeIO();
});
afterAll(() => {
	server.close();
});

function request(path: string, token: string, method = "GET", body?: unknown) {
	return fetch(`${baseUrl}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function register(handle: string): Promise<SignedInUser> {
	const response = await request("/auth/register", "", "POST", {
		email: `${handle}@chatty.test`,
		handle,
		displayName: handle,
		password: "SuperSecret123",
	});
	expect(response.status).toBe(201);
	const { token } = (await response.json()) as { token: string };
	const profile = await request("/users/me", token);
	const { id } = (await profile.json()) as { id: string };
	return { id, token };
}

it("preserves history for a peer's hide but returns 404 after author retraction over HTTP", async () => {
	const author = await register("history_author");
	const peer = await register("history_peer");
	const conversationResponse = await request("/conversations", author.token, "POST", { participantIds: [peer.id] });
	expect(conversationResponse.status).toBe(201);
	const { id: conversationId } = (await conversationResponse.json()) as { id: string };
	const path = `/conversations/${conversationId}/messages`;
	const sentResponse = await request(path, author.token, "POST", { content: "private original" });
	expect(sentResponse.status).toBe(201);
	const { id } = (await sentResponse.json()) as { id: string };
	expect((await request(`${path}/${id}`, author.token, "PATCH", { content: "revised" })).status).toBe(200);
	const history = await request(`${path}/${id}/edits`, peer.token);
	expect(history.status).toBe(200);
	expect(await history.text()).toContain("private original");
	expect((await request(`${path}/${id}/me`, peer.token, "DELETE")).status).toBe(204);
	expect((await request(`${path}/${id}/edits`, peer.token)).status).toBe(404);
	expect((await request(`${path}/${id}/edits`, author.token)).status).toBe(200);
	expect((await request(`${path}/${id}`, author.token, "DELETE")).status).toBe(200);
	const deletedHistory = await request(`${path}/${id}/edits`, author.token);
	expect(deletedHistory.status).toBe(404);
	expect(await deletedHistory.text()).not.toContain("private original");
});

it("sends a protected photo over multipart, withholds it, and opens it once without caching", async () => {
	const author = await register("protected_author");
	const peer = await register("protected_peer");
	const conversationResponse = await request("/conversations", author.token, "POST", { participantIds: [peer.id] });
	const { id: conversationId } = (await conversationResponse.json()) as { id: string };
	const path = `/conversations/${conversationId}/messages`;
	const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#c33" } })
		.png()
		.toBuffer();

	const body = new FormData();
	body.append("attachment", new Blob([new Uint8Array(photo)], { type: "image/png" }), "photo.png");
	body.append("content", "between us");
	body.append("isProtected", "true");
	const sent = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${author.token}` },
		body,
	});
	expect(sent.status).toBe(201);
	const { id, protection } = (await sent.json()) as { id: string; protection: { imageCount: number } | null };
	expect(protection?.imageCount).toBe(1);

	const peerHistory = await request(path, peer.token);
	expect(await peerHistory.text()).not.toContain("between us");

	const opened = await request(`${path}/${id}/open`, peer.token, "POST");
	expect(opened.status).toBe(200);
	expect(opened.headers.get("cache-control")).toBe("no-store");
	const content = (await opened.json()) as { content: string; attachments: unknown[] };
	expect(content.content).toBe("between us");
	expect(content.attachments).toHaveLength(1);
	expect((await request(`${path}/${id}/open`, peer.token, "POST")).status).toBe(400);
});

it("refuses to protect a voice note, a file or a sticker", async () => {
	const author = await register("protected_refuser");
	const peer = await register("protected_refused");
	const conversationResponse = await request("/conversations", author.token, "POST", { participantIds: [peer.id] });
	const { id: conversationId } = (await conversationResponse.json()) as { id: string };
	const response = await request(`/conversations/${conversationId}/messages`, author.token, "POST", {
		stickerKey: "wave",
		isProtected: true,
	});
	expect(response.status).toBe(400);
	expect(await response.text()).toContain("Only text and photos can be sent as a protected message");
});

it("rejects a disappearing timer that is not one of the presets", async () => {
	const author = await register("timer_author");
	const peer = await register("timer_peer");
	const conversationResponse = await request("/conversations", author.token, "POST", { participantIds: [peer.id] });
	const { id: conversationId } = (await conversationResponse.json()) as { id: string };
	const timerPath = `/conversations/${conversationId}/message-timer`;
	expect((await request(timerPath, peer.token, "PUT", { seconds: 60 })).status).toBe(400);
	const set = await request(timerPath, peer.token, "PUT", { seconds: 86_400 });
	expect(set.status).toBe(200);
	expect(((await set.json()) as { messageTimerSeconds: number }).messageTimerSeconds).toBe(86_400);
});
