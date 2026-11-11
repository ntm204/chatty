import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { register } from "../src/modules/auth/auth.service.js";
import { setAvatar } from "../src/modules/users/users.service.js";

/**
 * The one test in this suite that goes over real HTTP.
 *
 * Services are unit tested and controllers normally are not — but this endpoint
 * does not return JSON from a service, it streams a file, and everything that
 * can go wrong lives in the layer between them. It shipped broken once: the
 * default upload directory is `.data/uploads`, Express's `send` treats any path
 * segment starting with a dot as a hidden file, and every avatar came back 404
 * while every service test stayed green.
 */

// This worker's own upload directory — see tests/setup.ts.
const UPLOAD_DIR = process.env.UPLOAD_DIR!;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Port 0 lets the OS pick a free one, so this cannot collide with a dev
	// server the developer happens to have running.
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	server.close();
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

async function createUserWithAvatar(): Promise<string> {
	const { user } = await register({
		email: "minh@chatty.test",
		password: "SuperSecret123",
		handle: "minh_test",
		displayName: "Minh",
	});

	const image = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } } })
		.jpeg()
		.toBuffer();
	await setAvatar(user.id, image);

	return user.id;
}

describe("GET /users/:id/avatar", () => {
	it("serves the file", async () => {
		const userId = await createUserWithAvatar();

		const response = await fetch(`${baseUrl}/users/${userId}/avatar`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("serves it without an Authorization header", async () => {
		// The whole point: an <img> tag cannot send one.
		const userId = await createUserWithAvatar();

		expect((await fetch(`${baseUrl}/users/${userId}/avatar`)).status).toBe(200);
	});

	it("allows the response to be cached indefinitely", async () => {
		// Safe only because the URL carries the upload timestamp. If this header
		// is ever set without that version, changing a picture stops working.
		const userId = await createUserWithAvatar();

		const cacheControl = (await fetch(`${baseUrl}/users/${userId}/avatar`)).headers.get("cache-control");

		expect(cacheControl).toContain("immutable");
	});

	it("404s for a user who has no avatar", async () => {
		const { user } = await register({
			email: "an@chatty.test",
			password: "SuperSecret123",
			handle: "an_test",
			displayName: "An",
		});

		expect((await fetch(`${baseUrl}/users/${user.id}/avatar`)).status).toBe(404);
	});

	it("404s for a user who does not exist", async () => {
		expect((await fetch(`${baseUrl}/users/cm0000000000000000000000/avatar`)).status).toBe(404);
	});

	it("rejects an id shaped like a path escape", async () => {
		// Encoded so it survives the client and reaches the route as one segment.
		const response = await fetch(`${baseUrl}/users/${encodeURIComponent("../../etc/passwd")}/avatar`);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});
