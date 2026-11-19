import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { StoryDTO, StoryFeedDTO } from "@chatty/shared-types";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { installFakeIO } from "./fake-io.js";

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

/** Media URLs carry the configured public origin; the test server listens elsewhere. */
function local(url: string): string {
	const parsed = new URL(url);

	return `${baseUrl}${parsed.pathname}${parsed.search}`;
}

function request(path: string, token: string, method = "GET", body?: unknown) {
	return fetch(`${baseUrl}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function register(handle: string): Promise<{ id: string; token: string }> {
	const response = await request("/auth/register", "", "POST", {
		email: `${handle}@chatty.test`,
		handle,
		displayName: handle,
		password: "SuperSecret123",
	});
	const { token } = (await response.json()) as { token: string };
	const { id } = (await (await request("/users/me", token)).json()) as { id: string };

	return { id, token };
}

it("posts a photo story over multipart, serves it by token without caching, and shows it to a contact", async () => {
	const author = await register("story_author");
	const friend = await register("story_friend");
	await request("/conversations", author.token, "POST", { participantIds: [friend.id] });
	const photo = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#39f" } })
		.png()
		.toBuffer();

	const body = new FormData();
	body.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "photo.png");
	body.append("text", "sunset");
	body.append("audience", "contacts");
	const posted = await fetch(`${baseUrl}/stories`, {
		method: "POST",
		headers: { Authorization: `Bearer ${author.token}` },
		body,
	});
	expect(posted.status).toBe(201);
	const story = (await posted.json()) as StoryDTO;

	const media = await fetch(local(story.media!.url));
	expect(media.status).toBe(200);
	expect(media.headers.get("content-type")).toBe("image/webp");
	expect(media.headers.get("cache-control")).toBe("private, no-store");
	expect((await fetch(local(story.media!.thumbUrl!))).status).toBe(200);
	expect((await fetch(local(story.media!.url).replace(/token=[^&]+/u, "token=forged"))).status).toBe(404);

	const feed = (await (await request("/stories", friend.token)).json()) as StoryFeedDTO;
	expect(feed.authors[0]?.stories[0]?.text).toBe("sunset");
	expect(feed.authors[0]?.stories[0]).not.toHaveProperty("audience");

	expect((await request(`/stories/${story.id}/view`, friend.token, "POST")).status).toBe(204);
	expect((await request(`/stories/${story.id}`, author.token, "DELETE")).status).toBe(204);
	expect((await fetch(local(story.media!.url))).status).toBe(404);
});

it("posts a text story as JSON and refuses an empty one", async () => {
	const author = await register("story_texter");
	expect((await request("/stories", author.token, "POST", { text: "  " })).status).toBe(400);
	const posted = await request("/stories", author.token, "POST", { text: "hello", background: "amber" });
	expect(posted.status).toBe(201);
	expect(((await posted.json()) as StoryDTO).background).toBe("amber");
});
