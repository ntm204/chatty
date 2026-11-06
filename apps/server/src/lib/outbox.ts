import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { mailer, type Mail } from "./mailer.js";
import { prisma } from "./prisma.js";

/**
 * The durable half of sending email: a table of promises, and a worker that
 * keeps them.
 *
 * `mailer.ts` owns *how* a message leaves the building. This owns *whether it
 * eventually does*. The two are separate because they fail differently — a
 * provider outage is temporary and worth retrying, a malformed address is not,
 * and neither should be able to take down the request that caused the mail.
 *
 * The whole design rests on one property: `enqueueMail` writes inside the
 * caller's transaction. "This reset link is live" and "we owe this person the
 * link" become one commit. Before the outbox they were two steps with a gap, and
 * a crash in that gap produced an account with a live token whose owner was
 * never told — which reads to them as a reset that silently did nothing.
 */

/**
 * How many messages one pass may send.
 *
 * Claimed one at a time, each just before its own send, so a lease only ever
 * has to cover one send. Claiming the whole batch up front started every lease
 * at once: ten slow sends in a row outlived the later rows' leases, another
 * worker re-claimed them, and both delivered the same mail.
 */
const OUTBOX_BATCH_SIZE = 10;

/**
 * Attempts before a message is given up on.
 *
 * Six, with the backoff below, spans about fifteen minutes — longer than most
 * provider blips and comfortably inside a password reset link's own hour.
 * Retrying past that point delivers a mail whose only content is a dead link,
 * which is worse than the failure it was trying to recover from.
 */
const OUTBOX_MAX_ATTEMPTS = 6;

/** First retry delay; each further failure doubles it. */
const OUTBOX_BASE_BACKOFF_MS = 30_000;

/** How often the worker looks for due messages. */
const OUTBOX_POLL_MS = 5_000;

/**
 * How long a claim holds a message before another worker may take it.
 *
 * The answer to the one failure no `catch` can see: this process dying between
 * claiming a row and finishing the send. The row is left PENDING with its
 * attempt already counted, so without a lease the next pass — here or on another
 * instance — would pick it up immediately and might deliver it a second time.
 * Long enough to outlast one send — the SMTP timeouts in mailer.ts keep one
 * below it — short enough that a genuine crash does not strand somebody's reset
 * link for an hour.
 */
const OUTBOX_CLAIM_LEASE_MS = 120_000;

/**
 * Records a message to be sent, in the caller's transaction.
 *
 * Takes the transaction client rather than reaching for `prisma` itself, and
 * that argument is the entire point of this module — see the file comment. A
 * caller that passes the global client gets a row that commits independently of
 * whatever caused it, which is the bug this table exists to prevent.
 */
export async function enqueueMail(transaction: Prisma.TransactionClient, mail: Mail): Promise<void> {
	await transaction.outboxMessage.create({
		data: { to: mail.to, subject: mail.subject, body: mail.body },
		select: { id: true },
	});
}

/** A message the worker has claimed and is about to try. */
interface ClaimedMail {
	id: string;
	to: string;
	subject: string;
	body: string;
	attempts: number;
}

/**
 * How long to wait before attempt number `attempts + 1`, in seconds.
 *
 * Exponential, so a provider that is down does not get hammered by every
 * instance every five seconds for a quarter of an hour.
 *
 * Seconds rather than a `Date`, because the caller adds it to the database's
 * `NOW()` rather than to this process's. Every value this table compares
 * against the database clock is written by the database — see the schema
 * comment on `nextAttemptAt` for the bug that rule exists to prevent.
 */
function backoffSecondsFor(attempts: number): number {
	return (OUTBOX_BASE_BACKOFF_MS * 2 ** (attempts - 1)) / 1000;
}

/**
 * Takes ownership of the next due message, if there is one.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes more than one instance safe, and it is
 * the reason this is raw SQL rather than a Prisma query. Two workers running the
 * same claim at the same time would otherwise both read the same rows and send
 * every message twice — and a duplicated password reset mail is not a cosmetic
 * problem, it is two links where the user was promised one. `SKIP LOCKED` makes
 * the second worker step over the rows the first has taken and pick up different
 * ones, so both make progress and neither repeats the other.
 *
 * The claim also counts the attempt and pushes `nextAttemptAt` out by the lease,
 * in the same statement. Both halves matter: the count is what eventually gives
 * up, and the lease is what stops a crash mid-send from becoming a second
 * delivery. A successful send overwrites the lease with SENT a moment later, and
 * a caught failure overwrites it with the real backoff.
 *
 * The counted attempt doubles as the claim's identity. If this worker outlives
 * its lease and another re-claims the row, the count moves on, and the
 * `attempts` check in `markSent` and `markFailure` stops the late worker from
 * overwriting the newer claim's outcome.
 */
async function claimNextMail(): Promise<ClaimedMail | undefined> {
	const [claimed] = await prisma.$queryRaw<ClaimedMail[]>`
		UPDATE "OutboxMessage"
		SET "attempts" = "attempts" + 1,
		    "nextAttemptAt" = NOW() + make_interval(secs => ${OUTBOX_CLAIM_LEASE_MS / 1000})
		WHERE "id" IN (
			SELECT "id"
			FROM "OutboxMessage"
			WHERE "status" = 'PENDING' AND "nextAttemptAt" <= NOW()
			ORDER BY "nextAttemptAt"
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING "id", "to", "subject", "body", "attempts"
	`;

	return claimed;
}

/** Marks a claimed message delivered, and drops the body with it — unless the claim was taken over. */
async function markSent(claimed: ClaimedMail): Promise<void> {
	const { count } = await prisma.outboxMessage.updateMany({
		where: { id: claimed.id, status: "PENDING", attempts: claimed.attempts },
		// Emptied rather than kept: a delivered password reset body is a working
		// link to an account, and the row survives for the audit trail. The check
		// constraint on the table refuses a SENT row that still has one.
		data: { status: "SENT", sentAt: new Date(), body: "", lastError: null },
	});

	// The provider took it, but the row now belongs to a newer claim, which may
	// send it again. Worth a trace: it means a send outlived the lease.
	if (count === 0) logger.warn({ outboxId: claimed.id }, "outbox claim was taken over before delivery was recorded");
}

/**
 * Records a failed attempt: either a retry later, or the end of the road.
 *
 * The error message is kept and the body is not. Whoever reads this table after
 * an incident needs to know which address failed and why; they do not need the
 * link, and by then it has expired anyway.
 */
async function markFailure(claimed: ClaimedMail, error: unknown): Promise<void> {
	const lastError = error instanceof Error ? error.message : String(error);
	const isTerminal = claimed.attempts >= OUTBOX_MAX_ATTEMPTS;

	let updatedCount: number;
	if (isTerminal) {
		({ count: updatedCount } = await prisma.outboxMessage.updateMany({
			where: { id: claimed.id, status: "PENDING", attempts: claimed.attempts },
			data: { status: "FAILED", body: "", lastError },
		}));
	} else {
		// Raw, so the new schedule is `NOW() + backoff` in the database's clock
		// rather than this process's. A Prisma `data: { nextAttemptAt: someDate }`
		// here would reintroduce exactly the skew the schema comment describes.
		updatedCount = await prisma.$executeRaw`
			UPDATE "OutboxMessage"
			SET "nextAttemptAt" = NOW() + make_interval(secs => ${backoffSecondsFor(claimed.attempts)}),
			    "lastError" = ${lastError}
			WHERE "id" = ${claimed.id} AND "status" = 'PENDING' AND "attempts" = ${claimed.attempts}
		`;
	}

	// A newer claim owns the row now; its outcome is the one worth reporting.
	if (updatedCount === 0) {
		logger.warn({ outboxId: claimed.id }, "outbox claim was taken over before its failure was recorded");

		return;
	}

	// At `error` only when nothing more will be tried. A single failed attempt
	// that a retry will fix is not something to wake anyone up for.
	if (isTerminal) {
		logger.error({ outboxId: claimed.id, to: claimed.to, lastError }, "giving up on an outbox message");
	} else {
		logger.warn(
			{ outboxId: claimed.id, attempts: claimed.attempts, lastError },
			"outbox delivery failed, will retry",
		);
	}
}

/**
 * How long a settled message is kept before it is deleted.
 *
 * Long enough to answer "did that reset mail actually go out last week", short
 * enough that the table does not grow forever. Only SENT and FAILED rows are
 * eligible: a PENDING row is work, not history, however old it looks — and a
 * sweep that could not tell the difference would delete the backlog after an
 * outage rather than the record of one.
 */
const OUTBOX_RETENTION_DAYS = 30;

/**
 * Deletes settled messages past the retention window. Returns how many went.
 *
 * Safe to run from every instance: `DELETE` takes its own row locks, so two
 * sweeps racing each other remove disjoint sets rather than colliding. Bounded
 * by `nextAttemptAt`'s index only incidentally — this walks `createdAt`, which
 * is a sequential scan on a table this small and not worth an index until the
 * volume says otherwise.
 */
export async function pruneSettledOutbox(): Promise<number> {
	// Raw, and the cutoff is `NOW() - INTERVAL` rather than a `Date` from this
	// process, for the reason the schema comment on `nextAttemptAt` spells out:
	// nothing in this table compares an application clock against a database one.
	// Thirty days is wide enough that skew could not matter — following the rule
	// anyway is what stops the next, tighter window from reintroducing the bug.
	return prisma.$executeRaw`
		DELETE FROM "OutboxMessage"
		WHERE "status" <> 'PENDING'
			AND "createdAt" < NOW() - make_interval(days => ${OUTBOX_RETENTION_DAYS}::int)
	`;
}

/**
 * Claims and attempts one batch. Returns how many messages were delivered.
 *
 * Exported so tests can drive the worker a pass at a time rather than waiting on
 * a timer — a suite that sleeps to find out whether something happened is a
 * suite that is slow when it passes and confusing when it fails.
 */
export async function processOutboxOnce(): Promise<number> {
	let deliveredCount = 0;

	// One at a time rather than `Promise.all`: providers rate limit, and a burst
	// of parallel sends is the shape of request that gets an API key throttled.
	for (let sendCount = 0; sendCount < OUTBOX_BATCH_SIZE; sendCount += 1) {
		const mail = await claimNextMail();
		if (!mail) break;

		try {
			// The row id travels with the message and becomes its `Message-ID`, so
			// a retry after a crash mid-send is recognisably the same message
			// rather than a second one. See `Mail.id`.
			await mailer.send({ to: mail.to, subject: mail.subject, body: mail.body, id: mail.id });
			await markSent(mail);
			deliveredCount += 1;
		} catch (error) {
			await markFailure(mail, error);
		}
	}

	return deliveredCount;
}

/** How often settled messages are swept. Retention is measured in days; hourly is plenty. */
const OUTBOX_PRUNE_MS = 60 * 60 * 1000;

let pollTimer: NodeJS.Timeout | null = null;
let pruneTimer: NodeJS.Timeout | null = null;
let isPassRunning = false;

/**
 * Starts polling for due messages.
 *
 * Called from `server.ts` rather than on import, so that importing anything that
 * touches the outbox — a test, a script, the seed — does not silently start
 * sending mail.
 *
 * `isPassRunning` keeps two passes from overlapping in *this* process when a
 * provider is slower than the poll interval. Overlap across processes is fine
 * and expected; that is what `SKIP LOCKED` is for.
 */
export function startOutboxWorker(): void {
	if (pollTimer) return;

	pollTimer = setInterval(() => {
		if (isPassRunning) return;

		isPassRunning = true;
		void processOutboxOnce()
			.catch((error: unknown) => logger.error({ err: error }, "outbox pass failed"))
			.finally(() => {
				isPassRunning = false;
			});
	}, OUTBOX_POLL_MS);

	// A separate, much slower timer rather than a counter inside the poll. The two
	// have nothing to do with each other: delivery is measured in seconds and
	// retention in days, and tying them together means changing one to tune the
	// other.
	pruneTimer = setInterval(() => {
		void pruneSettledOutbox()
			.then((prunedCount) => {
				if (prunedCount > 0) logger.info({ prunedCount }, "pruned settled outbox messages");
			})
			.catch((error: unknown) => logger.error({ err: error }, "outbox prune failed"));
	}, OUTBOX_PRUNE_MS);

	// Without this the timers keep the event loop alive and the process refuses
	// to exit on SIGTERM until they are cleared.
	pollTimer.unref();
	pruneTimer.unref();

	logger.info(
		{ pollMs: OUTBOX_POLL_MS, transport: env.MAIL_TRANSPORT, retentionDays: OUTBOX_RETENTION_DAYS },
		"outbox worker started",
	);
}

export function stopOutboxWorker(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}

	if (pruneTimer) {
		clearInterval(pruneTimer);
		pruneTimer = null;
	}
}
