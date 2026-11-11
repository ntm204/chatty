import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { login } from "../src/modules/auth/auth.service.js";
import { installFakeIO } from "./fake-io.js";

/**
 * `PATCH /users/me` and `POST /auth/password` over real HTTP.
 *
 * The services are covered in profile.service.test.ts; what only shows up here
 * is everything between them and the wire — that the routes are mounted, that
 * `requireAuth` runs before each, that a typed error becomes the right status,
 * and that a body the schema rejects becomes a 400 rather than a 500. Phase 2's
 * avatar endpoint returned 500 for every request with every service test green;
 * that is the failure this file exists to catch.
 *
 * What it deliberately cannot cover: `changePasswordRateLimiter`. Its `skip`
 * turns it off when NODE_ENV is "test" — otherwise a suite that changes a
 * password ten times would start failing on the eleventh, for a reason that has
 * nothing to do with what it asserts. The limiter has to be exercised by hand
 * against a dev server.
 */

const PASSWORD = "SuperSecret123";

let server: Server;
let baseUrl: string;
let passwordHash: string;

beforeAll(async () => {
	// Port 0: the OS picks a free one, so this cannot collide with a dev server.
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	passwordHash = await bcrypt.hash(PASSWORD, 4);
});

// Changing a password disconnects the account's sockets.
beforeEach(() => {
	installFakeIO();
});

afterAll(() => {
	server.close();
});

async function createSignedInUser(handle = "minh_test"): Promise<{ userId: string; token: string }> {
	const user = await prisma.user.create({
		data: { email: `${handle}@chatty.test`, handle, displayName: "Minh", passwordHash },
		select: { id: true },
	});
	// Through login rather than by signing a token here: a token this suite minted
	// itself would keep passing if the real payload shape ever changed.
	const { token } = await login({ email: `${handle}@chatty.test`, password: PASSWORD });

	return { userId: user.id, token };
}

function authed(token: string, body: unknown, method: string): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	};
}

describe("PATCH /users/me", () => {
	it("updates the profile and returns it", async () => {
		const { token } = await createSignedInUser();

		const response = await fetch(`${baseUrl}/users/me`, authed(token, { displayName: "Minh Nguyen" }, "PATCH"));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ displayName: "Minh Nguyen", handle: "minh_test" });
	});

	it("401s without a token", async () => {
		const response = await fetch(`${baseUrl}/users/me`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ displayName: "Minh Nguyen" }),
		});

		expect(response.status).toBe(401);
	});

	it("400s on a body that changes nothing", async () => {
		// `.partial()` alone would accept {} and answer 200 having done nothing.
		const { token } = await createSignedInUser();

		expect((await fetch(`${baseUrl}/users/me`, authed(token, {}, "PATCH"))).status).toBe(400);
	});

	it("400s on a handle the pattern rejects", async () => {
		const { token } = await createSignedInUser();

		expect((await fetch(`${baseUrl}/users/me`, authed(token, { handle: "1nope" }, "PATCH"))).status).toBe(400);
	});

	it("409s on a handle somebody else has", async () => {
		const { token } = await createSignedInUser("minh_test");
		await createSignedInUser("an_test");

		const response = await fetch(`${baseUrl}/users/me`, authed(token, { handle: "an_test" }, "PATCH"));

		expect(response.status).toBe(409);
	});

	it("does not let the update write a password hash", async () => {
		// The schema strips unknown keys; without that, `data` would carry
		// whatever the client sent straight into Prisma.
		const { userId, token } = await createSignedInUser();

		await fetch(`${baseUrl}/users/me`, authed(token, { displayName: "Minh N", passwordHash: "x" }, "PATCH"));

		const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
		expect(user!.passwordHash).toBe(passwordHash);
	});
});

describe("POST /auth/password", () => {
	it("changes the password and returns a replacement token", async () => {
		const { token } = await createSignedInUser();

		const response = await fetch(
			`${baseUrl}/auth/password`,
			authed(token, { currentPassword: PASSWORD, newPassword: "BrandNewSecret456" }, "POST"),
		);

		expect(response.status).toBe(200);
		// Not a nicety: this request invalidated the token it was made with, so
		// without the replacement the caller is signed out of their own tab.
		expect(((await response.json()) as { token: string }).token).toBeTruthy();
		await expect(login({ email: "minh_test@chatty.test", password: "BrandNewSecret456" })).resolves.toBeTruthy();
	});

	it("401s without a token", async () => {
		const response = await fetch(`${baseUrl}/auth/password`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "BrandNewSecret456" }),
		});

		expect(response.status).toBe(401);
	});

	it("401s on a wrong current password", async () => {
		const { token } = await createSignedInUser();

		const response = await fetch(
			`${baseUrl}/auth/password`,
			authed(token, { currentPassword: "NotMyPassword", newPassword: "BrandNewSecret456" }, "POST"),
		);

		expect(response.status).toBe(401);
	});

	it("400s on a new password below the minimum length", async () => {
		const { token } = await createSignedInUser();

		const response = await fetch(
			`${baseUrl}/auth/password`,
			authed(token, { currentPassword: PASSWORD, newPassword: "short" }, "POST"),
		);

		expect(response.status).toBe(400);
	});
});
