import { deleteAttachment, listStoredAttachments } from "./attachment-storage.js";
import { deleteAvatar, listStoredAvatars } from "./avatar-storage.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

/**
 * Deleting the attachment files nothing points at any more.
 *
 * The gap this closes is the *send* path, not the delete one. Deleting a message
 * already removes its file (phase 8), and account deletion deliberately does not
 * — the messages survive, so their attachments are still referenced. What is left
 * is narrower and unfixable at the call site: `sendMessage` writes the file
 * before it writes the row, on purpose, because the other order leaves a message
 * pointing at a picture that is not there. A request that dies in that window
 * leaves a file nothing will ever reference, and no amount of care inside the
 * service can see it afterwards.
 *
 * So it is swept, the way the outbox's settled rows are: a slow timer, a bounded
 * query, and a rule about age that makes the dangerous case impossible rather
 * than unlikely.
 *
 * This is bytes rather than correctness. A file nobody references is invisible to
 * every screen in the app; it is only ever a disk filling up quietly on a machine
 * nobody is watching.
 */

/**
 * How long a file must have been on disk before it is a candidate.
 *
 * This is the whole safety argument, and it has to be generous rather than
 * tight. A file written seconds ago may belong to a request that has not
 * committed its row yet — the window `sendMessage` opens on purpose — and
 * deleting *that* file turns a working upload into a broken image, which is
 * strictly worse than the wasted bytes this is here to reclaim. An hour is far
 * past any request that is still alive, and the cost of waiting is a few
 * kilobytes for an hour.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/**
 * How often the sweep runs. Slow on purpose: it lists a directory and asks the
 * database about what it found, and nothing about a stray file is urgent.
 */
const ORPHAN_SWEEP_MS = 6 * 60 * 60 * 1000;

/**
 * Deletes attachment files with no row behind them. Returns how many went.
 *
 * Exported so a test can drive one pass rather than waiting on a timer — the
 * same reason `processOutboxOnce` is exported.
 *
 * Safe to run on every instance. Two sweeps racing compute the same set and both
 * call `rm --force`, which is what makes deleting the same file twice a no-op
 * rather than an error. There is deliberately no lock: a lock would be a second
 * thing to get right for an operation that is already idempotent.
 *
 * The database is asked only about the files that are old enough to be
 * candidates, so a deployment with a large upload directory and nothing wrong
 * with it asks about nothing at all.
 */
export async function sweepOrphanedAttachments(): Promise<number> {
	const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS);
	const candidates = (await listStoredAttachments()).filter((file) => file.modifiedAt < cutoff);
	if (candidates.length === 0) return 0;

	const candidateIds = candidates.map((candidate) => candidate.id);
	// Story photos share this directory (ADR 0025); a story row references one as surely as an attachment row.
	const [referenced, stories] = await Promise.all([
		prisma.attachment.findMany({ where: { id: { in: candidateIds } }, select: { id: true } }),
		prisma.story.findMany({ where: { mediaId: { in: candidateIds } }, select: { mediaId: true } }),
	]);
	const referencedIds = new Set([
		...referenced.map((attachment) => attachment.id),
		...stories.flatMap((story) => (story.mediaId ? [story.mediaId] : [])),
	]);

	const orphans = candidates.filter((candidate) => !referencedIds.has(candidate.id));
	let deletedCount = 0;

	for (const orphan of orphans) {
		try {
			await deleteAttachment(orphan.id);
			deletedCount += 1;
		} catch (error) {
			// Logged and stepped over rather than thrown: one unreadable file must not
			// stop the sweep reaching the rest, and the next pass will try it again.
			logger.error({ err: error, attachmentId: orphan.id }, "failed to remove an orphaned attachment file");
		}
	}

	return deletedCount;
}

/** Deletes old avatar files whose user is gone or no longer advertises an avatar. */
export async function sweepOrphanedAvatars(): Promise<number> {
	const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS);
	const candidates = (await listStoredAvatars()).filter((file) => file.modifiedAt < cutoff);
	if (candidates.length === 0) return 0;

	const referenced = await prisma.user.findMany({
		where: {
			id: { in: candidates.map((candidate) => candidate.userId) },
			avatarUpdatedAt: { not: null },
		},
		select: { id: true },
	});
	const referencedIds = new Set(referenced.map((user) => user.id));
	let deletedCount = 0;

	for (const orphan of candidates.filter((candidate) => !referencedIds.has(candidate.userId))) {
		try {
			await deleteAvatar(orphan.userId);
			deletedCount += 1;
		} catch (error) {
			logger.error({ err: error, userId: orphan.userId }, "failed to remove an orphaned avatar file");
		}
	}

	return deletedCount;
}

let sweepTimer: NodeJS.Timeout | null = null;

/**
 * Starts the periodic sweep.
 *
 * Called from `server.ts` rather than on import, for the reason the outbox
 * worker is: importing anything that touches this module — a test, a script —
 * must not start deleting files on a timer.
 */
export function startOrphanedUploadSweeper(): void {
	if (sweepTimer) return;

	sweepTimer = setInterval(() => {
		void Promise.all([sweepOrphanedAttachments(), sweepOrphanedAvatars()])
			.then(([attachmentCount, avatarCount]) => {
				if (attachmentCount + avatarCount > 0) {
					logger.info({ attachmentCount, avatarCount }, "removed orphaned upload files");
				}
			})
			.catch((error: unknown) => logger.error({ err: error }, "orphaned upload sweep failed"));
	}, ORPHAN_SWEEP_MS);

	// Without this the timer keeps the event loop alive and the process refuses to
	// exit on SIGTERM until it is cleared.
	sweepTimer.unref();

	logger.info({ sweepMs: ORPHAN_SWEEP_MS, graceMs: ORPHAN_GRACE_MS }, "orphaned upload sweeper started");
}

export function stopOrphanedUploadSweeper(): void {
	if (sweepTimer) {
		clearInterval(sweepTimer);
		sweepTimer = null;
	}
}
