import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAccessToken } from "../src/lib/access-token.js";
import { UnauthorizedError, ValidationError } from "../src/lib/errors.js";
import { mailer } from "../src/lib/mailer.js";
import { processOutboxOnce } from "../src/lib/outbox.js";
import { prisma } from "../src/lib/prisma.js";
import { login, requestPasswordReset, resetPassword } from "../src/modules/auth/auth.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const PASSWORD = "SuperSecret123";
const EMAIL = "minh_test@chatty.test";

/** One hash for the whole file — see the note in profile.service.test.ts. */
const passwordHash = await bcrypt.hash(PASSWORD, 4);

let fakeIO: FakeIO;
let sent: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	fakeIO = installFakeIO();
	// Spied rather than mocked out: the real ConsoleMailer would log a reset link
	// on every run, and the tests need to read what it was asked to send anyway.
	sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);
});

// Restored, not merely cleared. Re-spying a method that is still a spy stacks
// one wrapper on the next, and the call history carries over — which made
// `sent.mock.calls[0]` the *previous* test's mail and every token read from it
// belong to a user this test never created.
afterEach(() => {
	vi.restoreAllMocks();
});

async function createUser(): Promise<string> {
	const user = await prisma.user.create({
		data: { email: EMAIL, handle: "minh_test", displayName: "Minh", passwordHash },
		select: { id: true },
	});

	return user.id;
}

/**
 * Asks for a reset, then runs the worker until the mail has actually gone.
 *
 * `requestPasswordReset` no longer calls the provider — it writes a row to the
 * outbox in the same transaction as the token, and a worker pass is what turns
 * that into a send. Driving the worker by hand rather than waiting on its timer
 * keeps these tests fast and keeps them asserting through the provider, which is
 * still the only thing that matches what a user actually receives.
 */
async function requestResetAndDeliver(email = EMAIL): Promise<void> {
	await requestPasswordReset({ email });
	await processOutboxOnce();
}

/**
 * The token out of the emailed body.
 *
 * Pulled from the mail rather than from the database, and that is still the
 * point even though the outbox briefly holds the token in plaintext: what is in
 * `PasswordResetToken` is only ever a hash, and the outbox body is emptied the
 * moment the mail is delivered. A test that could read a usable token out of a
 * settled database would be proving the wrong thing.
 */
function tokenFromMail(callIndex = 0): string {
	const body = (sent.mock.calls[callIndex]![0] as { body: string }).body;
	const match = /token=([^\s]+)/.exec(body);

	return decodeURIComponent(match![1]!);
}

describe("requestPasswordReset", () => {
	it("mails a link with a usable token", async () => {
		await createUser();

		await requestResetAndDeliver();

		expect(sent).toHaveBeenCalledOnce();
		expect((sent.mock.calls[0]![0] as { to: string }).to).toBe(EMAIL);
		expect(tokenFromMail()).toBeTruthy();
	});

	it("stores only a hash, never the token itself", async () => {
		// A leaked database must not hand over working reset links.
		await createUser();
		await requestResetAndDeliver();
		const token = tokenFromMail();

		const stored = await prisma.passwordResetToken.findFirst({ select: { tokenHash: true } });

		expect(stored!.tokenHash).not.toBe(token);
		expect(stored!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
		// And the outbox, which did hold the live link between the commit and the
		// send, is not still holding it afterwards.
		const queued = await prisma.outboxMessage.findFirstOrThrow({ select: { status: true, body: true } });
		expect(queued.status).toBe("SENT");
		expect(queued.body).toBe("");
	});

	it("says nothing and does nothing for an address with no account", async () => {
		// No throw, no mail, no token, and nothing queued — the endpoint must not
		// become a way to ask who is registered here, and an outbox row would be
		// exactly that for anyone who could read the table.
		await expect(requestPasswordReset({ email: "nobody@chatty.test" })).resolves.toBeUndefined();
		await processOutboxOnce();

		expect(sent).not.toHaveBeenCalled();
		expect(await prisma.passwordResetToken.count()).toBe(0);
		expect(await prisma.outboxMessage.count()).toBe(0);
	});

	it("does not expose the unknown-address fast path through an immediate response", async () => {
		const startedAt = Date.now();

		await requestPasswordReset({ email: "nobody@chatty.test" });

		// The service floor is 300ms. A little scheduler tolerance keeps the test
		// about the security boundary rather than the precision of a CI clock.
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(280);
	});

	it("burns an outstanding link when a new one is asked for", async () => {
		// Otherwise a link someone obtained earlier stays live after the real
		// owner requests their own — two keys, one of them forgotten about.
		await createUser();
		await requestResetAndDeliver();
		const first = tokenFromMail();

		await requestResetAndDeliver();

		await expect(resetPassword({ token: first, newPassword: "BrandNewSecret456" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("leaves only the newest link live when two requests arrive together", async () => {
		const userId = await createUser();

		await Promise.all([requestPasswordReset({ email: EMAIL }), requestPasswordReset({ email: EMAIL })]);
		await processOutboxOnce();

		// Both requests are answered and both mails go out — the caller of the
		// losing one is not left waiting for a link that never arrives. Only one
		// of the two links still works, which is the next assertion.
		expect(sent).toHaveBeenCalledTimes(2);
		await expect(
			prisma.passwordResetToken.count({ where: { userId, usedAt: null, expiresAt: { gt: new Date() } } }),
		).resolves.toBe(1);
	});
});

describe("resetPassword", () => {
	async function requestLink(): Promise<{ userId: string; token: string }> {
		const userId = await createUser();
		await requestResetAndDeliver();

		return { userId, token: tokenFromMail() };
	}

	it("sets a password the user can sign in with", async () => {
		const { userId, token } = await requestLink();

		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		const result = await login({ email: EMAIL, password: "BrandNewSecret456" });
		expect(result.user.id).toBe(userId);
	});

	it("stops the old password working", async () => {
		const { token } = await requestLink();

		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		await expect(login({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
	});

	it("spends the link — a second use fails", async () => {
		const { token } = await requestLink();
		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		await expect(resetPassword({ token, newPassword: "AnotherSecret789" })).rejects.toBeInstanceOf(ValidationError);
	});

	it("lets exactly one of two simultaneous redemptions change the password", async () => {
		const { userId, token } = await requestLink();
		const candidates = ["FirstConcurrentSecret456", "SecondConcurrentSecret789"];

		const results = await Promise.allSettled(
			candidates.map((newPassword) => resetPassword({ token, newPassword })),
		);

		const winnerIndex = results.findIndex((result) => result.status === "fulfilled");
		const loserIndex = results.findIndex((result) => result.status === "rejected");
		expect(winnerIndex).toBeGreaterThanOrEqual(0);
		expect(loserIndex).toBeGreaterThanOrEqual(0);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results[loserIndex]).toEqual(
			expect.objectContaining({ status: "rejected", reason: expect.any(ValidationError) }),
		);
		await expect(login({ email: EMAIL, password: candidates[winnerIndex]! })).resolves.toBeDefined();
		await expect(login({ email: EMAIL, password: candidates[loserIndex]! })).rejects.toBeInstanceOf(
			UnauthorizedError,
		);
		expect(fakeIO.disconnects.filter((room) => room === `user:${userId}`)).toHaveLength(1);
	});

	it("rolls the token claim back when the password update fails", async () => {
		const { userId, token } = await requestLink();
		const constraintName = "User_reject_password_change_for_atomicity_test";
		await prisma.$executeRawUnsafe(
			`ALTER TABLE "User" ADD CONSTRAINT "${constraintName}" CHECK ("passwordChangedAt" IS NULL);`,
		);

		try {
			await expect(resetPassword({ token, newPassword: "BrandNewSecret456" })).rejects.toThrow();
		} finally {
			await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "${constraintName}";`);
		}

		const [user, resetToken] = await Promise.all([
			prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } }),
			prisma.passwordResetToken.findFirstOrThrow({ where: { userId }, select: { usedAt: true } }),
		]);
		await expect(bcrypt.compare(PASSWORD, user.passwordHash)).resolves.toBe(true);
		expect(resetToken.usedAt).toBeNull();
		expect(fakeIO.disconnects).not.toContain(`user:${userId}`);
	});

	it("rejects a token that has expired", async () => {
		const { token } = await requestLink();
		await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

		await expect(resetPassword({ token, newPassword: "BrandNewSecret456" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("rejects a token nobody ever issued", async () => {
		await createUser();

		await expect(resetPassword({ token: "made-up", newPassword: "BrandNewSecret456" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("reports expired, spent and imaginary tokens identically", async () => {
		// The caller is not signed in. Telling the three apart would say something
		// about an account to someone who has not proved they own it.
		const { token } = await requestLink();
		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		const spent = await resetPassword({ token, newPassword: "X" }).catch((error: Error) => error.message);
		const imaginary = await resetPassword({ token: "made-up", newPassword: "X" }).catch(
			(error: Error) => error.message,
		);

		expect(spent).toBe(imaginary);
	});

	it("ends every session on the account", async () => {
		const { userId, token } = await requestLink();

		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		expect(fakeIO.disconnects).toContain(`user:${userId}`);
	});

	it("invalidates tokens issued before the reset", async () => {
		const { token } = await requestLink();
		const { token: accessToken } = await login({ email: EMAIL, password: PASSWORD });

		// `iat` is whole seconds, and a token minted inside the same second as the
		// reset is deliberately still honoured — so step past the boundary.
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await resetPassword({ token, newPassword: "BrandNewSecret456" });

		await expect(verifyAccessToken(accessToken)).rejects.toBeInstanceOf(UnauthorizedError);
	});
});
