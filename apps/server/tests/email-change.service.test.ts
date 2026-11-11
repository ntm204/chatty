import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthorizedError, ValidationError } from "../src/lib/errors.js";
import { mailer } from "../src/lib/mailer.js";
import { processOutboxOnce } from "../src/lib/outbox.js";
import { prisma } from "../src/lib/prisma.js";
import { confirmEmailChange, login, requestEmailChange } from "../src/modules/auth/auth.service.js";
import { installFakeIO } from "./fake-io.js";

const PASSWORD = "SuperSecret123";
const OLD_EMAIL = "minh_test@chatty.test";
const NEW_EMAIL = "minh_new@chatty.test";

/** One hash for the whole file — bcrypt at cost 12 is ~300ms a call. */
const passwordHash = await bcrypt.hash(PASSWORD, 4);

let sent: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	installFakeIO();
	sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);
});

// Restored rather than cleared, for the reason password-reset.service.test.ts
// spells out: a re-spied spy stacks and carries its call history into the next
// test, where the token read out of "the first mail" belongs to another user.
afterEach(() => {
	vi.restoreAllMocks();
});

async function createUser(email = OLD_EMAIL, handle = "minh_test"): Promise<string> {
	const user = await prisma.user.create({
		data: { email, handle, displayName: "Minh", passwordHash },
		select: { id: true },
	});

	return user.id;
}

/** Asks for the change, then runs the worker so the mail actually leaves. */
async function requestAndDeliver(userId: string, newEmail = NEW_EMAIL): Promise<void> {
	await requestEmailChange(userId, { newEmail, currentPassword: PASSWORD });
	await processOutboxOnce();
}

/**
 * What the mailer was asked to send, in order.
 *
 * Cast rather than inferred: `vi.spyOn`'s return type does not carry the
 * argument tuple through `mock.calls` here, and every test in this file reads
 * the same two fields off it.
 */
interface SentMail {
	to: string;
	body: string;
}

function sentMails(): SentMail[] {
	return (sent.mock.calls as unknown as [SentMail][]).map(([mail]) => mail);
}

/**
 * The token out of the mail that went to the new address.
 *
 * Read from what was sent rather than from the database, the same way the reset
 * tests do it: the token row holds a hash, and the only place a usable token
 * exists is the message the person receives.
 */
function tokenFromMail(): string {
	const toNew = sentMails().find((mail) => mail.to === NEW_EMAIL);
	const match = /token=([^\s]+)/.exec(toNew!.body);

	return decodeURIComponent(match![1]!);
}

async function emailOf(userId: string): Promise<string> {
	const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });

	return user.email;
}

describe("requestEmailChange", () => {
	it("mails a link to the new address and a warning to the old one", async () => {
		const userId = await createUser();

		await requestAndDeliver(userId);

		// Sorted, because the order genuinely is not defined and asserting it makes
		// this test fail at random. Both rows are written in one transaction, and
		// `nextAttemptAt` defaults to `CURRENT_TIMESTAMP`, which PostgreSQL
		// evaluates once at *transaction start* — so the worker's
		// `ORDER BY "nextAttemptAt"` is a tie and either mail may go first. Same
		// property the phase 9 tests already record about `NOW()`.
		const recipients = sentMails()
			.map((mail) => mail.to)
			.sort();
		// The warning to the old address is half the feature: changing where a
		// password reset is delivered is how an account is taken, and the person it
		// is being taken from is told while they can still act on it.
		expect(recipients).toEqual([NEW_EMAIL, OLD_EMAIL].sort());
	});

	it("changes nothing about the account until the link is opened", async () => {
		const userId = await createUser();

		await requestAndDeliver(userId);

		expect(await emailOf(userId)).toBe(OLD_EMAIL);
		// And the unconfirmed address is not a credential: it cannot be signed in
		// with, which is the whole reason the address is parked on a token row.
		await expect(login({ email: NEW_EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
		await expect(login({ email: OLD_EMAIL, password: PASSWORD })).resolves.toBeTruthy();
	});

	it("refuses without the current password", async () => {
		const userId = await createUser();

		await expect(
			requestEmailChange(userId, { newEmail: NEW_EMAIL, currentPassword: "not-the-password" }),
		).rejects.toBeInstanceOf(UnauthorizedError);

		expect(await prisma.emailChangeToken.count()).toBe(0);
		expect(await prisma.outboxMessage.count()).toBe(0);
	});

	it("refuses an address that already has an account", async () => {
		const userId = await createUser();
		await createUser(NEW_EMAIL, "an_test");

		await expect(
			requestEmailChange(userId, { newEmail: NEW_EMAIL, currentPassword: PASSWORD }),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it("burns an outstanding link when a second one is asked for", async () => {
		// Two live links to two different addresses is one more than anybody asked
		// for, and the forgotten one is the dangerous half.
		const userId = await createUser();
		await requestAndDeliver(userId);
		const firstToken = tokenFromMail();

		await requestEmailChange(userId, { newEmail: "minh_other@chatty.test", currentPassword: PASSWORD });

		await expect(confirmEmailChange({ token: firstToken })).rejects.toBeInstanceOf(ValidationError);
		expect(await emailOf(userId)).toBe(OLD_EMAIL);
	});
});

describe("confirmEmailChange", () => {
	it("moves the account to the confirmed address", async () => {
		const userId = await createUser();
		await requestAndDeliver(userId);

		await confirmEmailChange({ token: tokenFromMail() });

		expect(await emailOf(userId)).toBe(NEW_EMAIL);
		await expect(login({ email: NEW_EMAIL, password: PASSWORD })).resolves.toBeTruthy();
		await expect(login({ email: OLD_EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(UnauthorizedError);
	});

	it("spends the link, so a second click does nothing", async () => {
		const userId = await createUser();
		await requestAndDeliver(userId);
		const token = tokenFromMail();
		await confirmEmailChange({ token });

		await expect(confirmEmailChange({ token })).rejects.toBeInstanceOf(ValidationError);
		expect(await emailOf(userId)).toBe(NEW_EMAIL);
	});

	it("refuses an expired link", async () => {
		const userId = await createUser();
		await requestAndDeliver(userId);
		const token = tokenFromMail();
		// An hour into the past rather than "now": a link that is due to expire this
		// instant is a race, and this test is about one that already has.
		await prisma.emailChangeToken.updateMany({ data: { expiresAt: new Date(Date.now() - 60 * 60 * 1000) } });

		await expect(confirmEmailChange({ token })).rejects.toBeInstanceOf(ValidationError);
		expect(await emailOf(userId)).toBe(OLD_EMAIL);
	});

	it("fails cleanly when somebody else took the address in the meantime", async () => {
		// The gap between asking and confirming is an hour wide, and nothing
		// reserves the address during it. A ConflictError rather than the 500 an
		// unhandled unique violation would produce.
		const userId = await createUser();
		await requestAndDeliver(userId);
		const token = tokenFromMail();
		await createUser(NEW_EMAIL, "an_test");

		await expect(confirmEmailChange({ token })).rejects.toBeInstanceOf(ConflictError);
		expect(await emailOf(userId)).toBe(OLD_EMAIL);
	});

	it("refuses a token that never existed", async () => {
		await expect(confirmEmailChange({ token: "made-up" })).rejects.toBeInstanceOf(ValidationError);
	});
});
