import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/lib/logger.js";
import { mailer, type Mail } from "../src/lib/mailer.js";
import { enqueueMail, processOutboxOnce, pruneSettledOutbox } from "../src/lib/outbox.js";
import { prisma } from "../src/lib/prisma.js";

const MAIL: Mail = { to: "minh@chatty.test", subject: "Hello", body: "the body, with a secret link" };

let sent: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);
	// The worker logs a warning per failed attempt and an error when it gives up.
	// Both are correct behaviour and both would otherwise fill the test output.
	vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	vi.spyOn(logger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Queues a message the ordinary way: inside a transaction, like a real caller. */
async function queue(mail: Mail = MAIL): Promise<string> {
	return prisma.$transaction(async (transaction) => {
		await enqueueMail(transaction, mail);

		const queued = await transaction.outboxMessage.findFirstOrThrow({ select: { id: true } });

		return queued.id;
	});
}

/**
 * Makes a message overdue: in the database's clock, and by a wide margin.
 *
 * Both halves were learned the hard way. `data: { nextAttemptAt: new Date() }`
 * sends *this process's* idea of the time while the claim compares against
 * Postgres's `NOW()` — two clocks, and the bug the schema comment on
 * `nextAttemptAt` describes. Writing `= NOW()` fixes the clock and still flakes,
 * because `NOW()` is transaction *start* time: two statements issued in order
 * are not guaranteed to see it advance, so a row set due "now" can read as a
 * hair in the future to the very next statement. An hour of margin makes the
 * question stop existing, which is what a test that is about giving up after six
 * attempts should want.
 */
async function makeOverdue(id: string): Promise<void> {
	await prisma.$executeRaw`UPDATE "OutboxMessage" SET "nextAttemptAt" = NOW() - INTERVAL '1 hour' WHERE id = ${id}`;
}

function readRow(id: string) {
	return prisma.outboxMessage.findUniqueOrThrow({
		where: { id },
		select: { status: true, body: true, attempts: true, lastError: true, sentAt: true, nextAttemptAt: true },
	});
}

describe("enqueueMail", () => {
	it("commits with the transaction that queued it", async () => {
		const id = await queue();

		await expect(readRow(id)).resolves.toMatchObject({ status: "PENDING", attempts: 0, sentAt: null });
	});

	it("is rolled back when the transaction that queued it fails", async () => {
		// The property the whole table exists for. A reset token that never commits
		// must not leave behind a promise to mail the link it would have been.
		await expect(
			prisma.$transaction(async (transaction) => {
				await enqueueMail(transaction, MAIL);

				throw new Error("the caller's work failed");
			}),
		).rejects.toThrow("the caller's work failed");

		expect(await prisma.outboxMessage.count()).toBe(0);
	});

	it("does not send anything by itself", async () => {
		// Queueing is a database write. Nothing reaches a provider until a worker
		// pass picks the row up, which is what keeps a slow provider off the
		// request path entirely.
		await queue();

		expect(sent).not.toHaveBeenCalled();
	});
});

describe("processOutboxOnce", () => {
	it("sends a queued message and marks it delivered", async () => {
		const id = await queue();

		await expect(processOutboxOnce()).resolves.toBe(1);

		expect(sent).toHaveBeenCalledWith({ ...MAIL, id });
		const row = await readRow(id);
		expect(row.status).toBe("SENT");
		expect(row.sentAt).not.toBeNull();
	});

	it("empties the body once there is nothing left to send", async () => {
		// A delivered password reset body is a working link to somebody's account.
		// The check constraint on the table refuses a SENT row that still has one,
		// so this failing would be a 500 rather than a quiet leak — but the point
		// is that the worker redacts rather than that the constraint catches it.
		const id = await queue();

		await processOutboxOnce();

		expect((await readRow(id)).body).toBe("");
	});

	it("does not send the same message twice across two passes", async () => {
		await queue();

		await processOutboxOnce();
		await processOutboxOnce();

		expect(sent).toHaveBeenCalledOnce();
	});

	it("keeps a failed message for another try, with the reason", async () => {
		sent.mockRejectedValue(new Error("provider unavailable"));
		const id = await queue();

		await expect(processOutboxOnce()).resolves.toBe(0);

		const row = await readRow(id);
		expect(row.status).toBe("PENDING");
		expect(row.attempts).toBe(1);
		expect(row.lastError).toBe("provider unavailable");
		// Kept, because there is still something to send.
		expect(row.body).toBe(MAIL.body);
	});

	it("backs off rather than retrying on the very next pass", async () => {
		// Otherwise a provider that is down gets hammered every poll interval by
		// every instance, for as long as it stays down.
		sent.mockRejectedValue(new Error("provider unavailable"));
		await queue();
		await processOutboxOnce();

		await processOutboxOnce();

		expect(sent).toHaveBeenCalledOnce();
	});

	it("gives up after enough attempts, and redacts on the way out", async () => {
		sent.mockRejectedValue(new Error("provider unavailable"));
		const id = await queue();

		// Six attempts, each forced due by winding the backoff back. Driving it this
		// way rather than with fake timers keeps the backoff arithmetic itself
		// under test in the two cases above, where it matters.
		for (let attempt = 0; attempt < 6; attempt += 1) {
			await makeOverdue(id);
			await processOutboxOnce();
		}

		const row = await readRow(id);
		expect(row.status).toBe("FAILED");
		expect(row.attempts).toBe(6);
		// The reason survives for whoever reads this table after an incident; the
		// link does not, and by now it has expired anyway.
		expect(row.lastError).toBe("provider unavailable");
		expect(row.body).toBe("");
	});

	it("leaves a message alone until it is due", async () => {
		const id = await queue();
		await prisma.outboxMessage.update({
			where: { id },
			data: { nextAttemptAt: new Date(Date.now() + 60_000) },
			select: { id: true },
		});

		await expect(processOutboxOnce()).resolves.toBe(0);

		expect(sent).not.toHaveBeenCalled();
	});

	it("delivers each message exactly once when two workers run together", async () => {
		// What `FOR UPDATE SKIP LOCKED` is for. Two instances both poll this table,
		// and a password reset delivered twice is two links where the person was
		// promised one. Without SKIP LOCKED both passes read the same rows.
		const recipients = ["a@chatty.test", "b@chatty.test", "c@chatty.test", "d@chatty.test"];
		for (const to of recipients) {
			await queue({ ...MAIL, to });
		}

		const [first, second] = await Promise.all([processOutboxOnce(), processOutboxOnce()]);

		expect(first + second).toBe(recipients.length);
		expect(sent).toHaveBeenCalledTimes(recipients.length);
		const delivered = sent.mock.calls.map((call: unknown[]) => (call[0] as Mail).to);
		expect([...delivered].sort()).toEqual([...recipients].sort());
	});

	it("does not let a slow batch outlive the claim on messages it has not reached yet", async () => {
		// Real timing would need a provider slower than the two-minute lease, so the
		// first send instead expires every other row's lease and lets a second
		// worker in — exactly what the database would see if it had taken that long.
		// A worker that claimed the whole batch up front would then send the second
		// message again after the takeover had already delivered it.
		await queue({ ...MAIL, to: "a@chatty.test" });
		await queue({ ...MAIL, to: "b@chatty.test" });
		let hasTakenOver = false;
		sent.mockImplementation(async (mail: Mail) => {
			if (hasTakenOver) return;

			hasTakenOver = true;
			await prisma.$executeRaw`
				UPDATE "OutboxMessage" SET "nextAttemptAt" = NOW() - INTERVAL '1 hour' WHERE "id" <> ${mail.id}
			`;
			await processOutboxOnce();
		});

		await processOutboxOnce();

		const delivered = sent.mock.calls.map((call: unknown[]) => (call[0] as Mail).to);
		expect([...delivered].sort()).toEqual(["a@chatty.test", "b@chatty.test"]);
	});

	it("does not let a worker whose claim was taken over overwrite the newer outcome", async () => {
		// The send outlives its lease, another worker re-claims and delivers, and
		// only then does the first send fail. That late failure belongs to a claim
		// that no longer owns the row, so it must not touch it.
		const id = await queue();
		sent.mockImplementationOnce(async () => {
			await makeOverdue(id);
			await processOutboxOnce();
			throw new Error("timed out after the lease");
		});

		await processOutboxOnce();

		await expect(readRow(id)).resolves.toMatchObject({ status: "SENT", attempts: 2, lastError: null });
	});

	it("does nothing, quietly, when there is nothing queued", async () => {
		await expect(processOutboxOnce()).resolves.toBe(0);

		expect(sent).not.toHaveBeenCalled();
	});

	it("hands the row id down as the message's identity", async () => {
		// Delivery is at-least-once, so a duplicate is possible by design. Passing
		// the row id through means the retry arrives with the `Message-ID` the
		// first attempt had, which is the header receivers already use to collapse
		// duplicates — see `Mail.id`. Without it nodemailer invents a fresh one and
		// the second copy is, to every client, a second message.
		const id = await queue();

		await processOutboxOnce();

		expect(sent).toHaveBeenCalledWith(expect.objectContaining({ id }));
	});
});

describe("pruneSettledOutbox", () => {
	/**
	 * Backdates a row, in the database's clock.
	 *
	 * The `::int` is required, not decorative: Prisma sends a JS number as
	 * `bigint`, and `make_interval`'s `days` is `integer` — bigint to integer is
	 * an assignment cast, which Postgres will not apply implicitly, so the
	 * function simply does not resolve. (`secs` is `double precision`, where the
	 * implicit cast does exist, which is why the claim query gets away without
	 * one.)
	 */
	async function backdate(id: string, days: number): Promise<void> {
		await prisma.$executeRaw`
			UPDATE "OutboxMessage" SET "createdAt" = NOW() - make_interval(days => ${days}::int) WHERE id = ${id}
		`;
	}

	it("removes a delivered message once it is old enough", async () => {
		const id = await queue();
		await processOutboxOnce();
		await backdate(id, 31);

		await expect(pruneSettledOutbox()).resolves.toBe(1);

		expect(await prisma.outboxMessage.count()).toBe(0);
	});

	it("keeps a delivered message that is still inside the window", async () => {
		// The table is also the answer to "did that reset mail actually go out last
		// week", so recent history stays.
		const id = await queue();
		await processOutboxOnce();
		await backdate(id, 3);

		await expect(pruneSettledOutbox()).resolves.toBe(0);

		expect(await prisma.outboxMessage.count()).toBe(1);
	});

	it("never removes a message still waiting to be sent, however old", async () => {
		// The one that would hurt. A provider outage lasting longer than the
		// retention window leaves a backlog of old PENDING rows — a sweep that went
		// by age alone would delete the work instead of the record of it.
		const id = await queue();
		await backdate(id, 365);

		await expect(pruneSettledOutbox()).resolves.toBe(0);

		const row = await readRow(id);
		expect(row.status).toBe("PENDING");
	});

	it("removes a message that was given up on", async () => {
		sent.mockRejectedValue(new Error("provider unavailable"));
		const id = await queue();
		for (let attempt = 0; attempt < 6; attempt += 1) {
			await makeOverdue(id);
			await processOutboxOnce();
		}
		expect((await readRow(id)).status).toBe("FAILED");
		await backdate(id, 31);

		await expect(pruneSettledOutbox()).resolves.toBe(1);

		expect(await prisma.outboxMessage.count()).toBe(0);
	});
});
