import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { UnauthorizedError } from "../src/lib/errors.js";
import { mailer } from "../src/lib/mailer.js";
import { processOutboxOnce } from "../src/lib/outbox.js";
import { prisma } from "../src/lib/prisma.js";
import type { JwtPayload } from "../src/middlewares/require-auth.js";
import {
	changePassword,
	logout,
	refreshSession,
	register,
	requestPasswordReset,
	resetPassword,
} from "../src/modules/auth/auth.service.js";
import { issueRefreshToken } from "../src/modules/auth/auth.sessions.js";
import { installFakeIO } from "./fake-io.js";

/**
 * Sessions, which before phase 21 did not exist as a thing: the session *was* a
 * seven-day JWT, so "sign out" cleared a browser's storage and left every other
 * copy of the token working for the rest of the week.
 *
 * **Almost nothing here goes through `register` or `login`**, and that is
 * deliberate rather than lazy — see the warning in `tests/setup.ts`. Each of
 * those is a bcrypt at cost 12, and a file that spends them freely pushes its
 * slowest tests past the 5s timeout, whereupon Vitest abandons the test but not
 * its promise chain and the wreckage lands in whichever file runs next. This
 * file learned that the hard way. `issueRefreshToken` opens a session directly,
 * which is what these tests are actually about; the three that genuinely
 * exercise a password say so.
 */

const PASSWORD = "SuperSecret123";
const EMAIL = "minh_sessions@chatty.test";

/** One hash for the whole file, for the reason above. */
const passwordHash = await bcrypt.hash(PASSWORD, 4);

let sent: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	// `changePassword` and `resetPassword` both push live sockets off the
	// account, which needs an io to push them off.
	installFakeIO();
	sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);
});

// Restored rather than cleared: re-spying a live spy stacks wrappers and carries
// the call history over — see password-reset.service.test.ts.
afterEach(() => {
	vi.restoreAllMocks();
});

async function createUser(): Promise<string> {
	const user = await prisma.user.create({
		data: { email: EMAIL, handle: "minh_sessions", displayName: "Minh", passwordHash },
		select: { id: true },
	});

	return user.id;
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

describe("signing in", () => {
	it("returns a refresh token alongside the access token", async () => {
		const result = await register({
			email: EMAIL,
			password: PASSWORD,
			handle: "minh_sessions",
			displayName: "Minh",
		});

		expect(result.token).toEqual(expect.any(String));
		expect(result.refreshToken).toEqual(expect.any(String));
	});

	it("stores only a hash of the refresh token, never the token", async () => {
		// The same rule the reset link follows: a leaked database must not be a
		// drawer full of working sessions.
		const refreshToken = await issueRefreshToken(await createUser());

		const stored = await prisma.refreshToken.findMany({ select: { tokenHash: true } });

		expect(stored).toHaveLength(1);
		expect(stored[0]!.tokenHash).toBe(hashToken(refreshToken));
		expect(stored[0]!.tokenHash).not.toBe(refreshToken);
	});

	it("gives the access token a short life, so a copied one is worth minutes", async () => {
		const { token } = await refreshSession(await issueRefreshToken(await createUser()));

		const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload & { exp: number };

		expect(payload.exp - payload.iat!).toBeLessThanOrEqual(15 * 60);
	});

	it("keeps sessions separate, so one device signing out leaves the other alone", async () => {
		const userId = await createUser();
		const laptop = await issueRefreshToken(userId);
		const phone = await issueRefreshToken(userId);

		await logout(laptop);

		await expect(refreshSession(phone)).resolves.toEqual({
			token: expect.any(String),
			refreshToken: expect.any(String),
		});
	});
});

describe("refreshing", () => {
	it("returns a new pair", async () => {
		const refreshToken = await issueRefreshToken(await createUser());

		const refreshed = await refreshSession(refreshToken);

		expect(refreshed.token).toEqual(expect.any(String));
		expect(refreshed.refreshToken).not.toBe(refreshToken);
	});

	it("spends the token it was given, so a copied one works at most once", async () => {
		// Rotation is the whole mitigation for a refresh token read out of
		// localStorage: it survives only until the real client next refreshes.
		const refreshToken = await issueRefreshToken(await createUser());
		await refreshSession(refreshToken);

		await expect(refreshSession(refreshToken)).rejects.toThrow(UnauthorizedError);
	});

	it("refuses a token that was never issued", async () => {
		await expect(refreshSession("not-a-real-token")).rejects.toThrow(UnauthorizedError);
	});

	it("refuses an expired token", async () => {
		const refreshToken = await issueRefreshToken(await createUser());
		await prisma.refreshToken.updateMany({
			where: { tokenHash: hashToken(refreshToken) },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});

		await expect(refreshSession(refreshToken)).rejects.toThrow(UnauthorizedError);
	});

	it("lets exactly one of two simultaneous refreshes win", async () => {
		// Two tabs waking together present the same token. A read-then-write would
		// let both pass and leave one session that had quietly become two; the
		// conditional claim is what makes the loser fail instead.
		const refreshToken = await issueRefreshToken(await createUser());

		const outcomes = await Promise.allSettled([refreshSession(refreshToken), refreshSession(refreshToken)]);

		expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
		expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
	});
});

describe("signing out", () => {
	it("ends the session, so it cannot be refreshed again", async () => {
		const refreshToken = await issueRefreshToken(await createUser());

		await logout(refreshToken);

		await expect(refreshSession(refreshToken)).rejects.toThrow(UnauthorizedError);
	});

	it("says nothing about a token that was never real", async () => {
		// Confirming a token existed tells somebody holding a stolen copy that it
		// was worth having. Signing out has nothing to report either way.
		await expect(logout("not-a-real-token")).resolves.toBeUndefined();
	});
});

describe("a password change", () => {
	it("ends every other session and hands the caller a working replacement", async () => {
		// One test rather than two: both halves need the same bcrypt-heavy
		// `changePassword`, and this file must not spend more of those than it has
		// to.
		const userId = await createUser();
		const phone = await issueRefreshToken(userId);

		const replacement = await changePassword(userId, {
			currentPassword: PASSWORD,
			newPassword: "BrandNewSecret456",
		});

		// Every other device is signed out...
		await expect(refreshSession(phone)).rejects.toThrow(UnauthorizedError);
		// ...and the person who made the change is not signed out of their own tab.
		await expect(refreshSession(replacement.refreshToken)).resolves.toEqual({
			token: expect.any(String),
			refreshToken: expect.any(String),
		});
	});
});

describe("a password reset", () => {
	it("ends every session, which is the entire point of resetting", async () => {
		// A reset exists for "somebody else has my account". Leaving the sessions
		// they opened alive would make it decorative.
		const userId = await createUser();
		const stolen = await issueRefreshToken(userId);

		await requestPasswordReset({ email: EMAIL });
		await processOutboxOnce();
		const body = (sent.mock.calls[0]![0] as { body: string }).body;
		const token = decodeURIComponent(/token=([^\s]+)/.exec(body)![1]!);

		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		await expect(refreshSession(stolen)).rejects.toThrow(UnauthorizedError);
	});
});

describe("deleting an account", () => {
	it("takes its sessions with it", async () => {
		const userId = await createUser();
		const refreshToken = await issueRefreshToken(userId);

		await prisma.user.delete({ where: { id: userId } });

		expect(await prisma.refreshToken.count()).toBe(0);
		await expect(refreshSession(refreshToken)).rejects.toThrow(UnauthorizedError);
	});
});
