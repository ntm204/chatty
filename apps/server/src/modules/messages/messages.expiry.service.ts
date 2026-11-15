/**
 * Erasing messages whose time is up. See ADR 0023.
 */
import { Prisma } from "@prisma/client";
import { deleteAttachment } from "../../lib/attachment-storage.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getIO } from "../../lib/socket-bus.js";
import { loadPinnedMessages } from "./messages.annotations.service.js";

/**
 * How often the sweep looks for expired messages.
 *
 * Short, because this is the step that removes the *content* — every read path
 * already hides an expired message the instant it expires, so the gap is about
 * how long the words and files stay on disk, not about what anybody can see.
 * Ten seconds of that is a promise kept; an hour would not be.
 */
export const MESSAGE_EXPIRY_SWEEP_MS = 10_000;

/** Rows per transaction: bounded, so a backlog after downtime is many short locks rather than one long one. */
const EXPIRY_BATCH_SIZE = 200;

interface ExpiringRow {
	id: string;
	conversationId: string;
}

/**
 * Tombstones every message past its `expiresAt`, deletes its files, and tells
 * each conversation. Returns how many messages it erased.
 *
 * The erase is the same one a delete-for-everyone performs, and goes further:
 * a tombstone keeps its row for read markers and paging cursors (see
 * `Message.deletedAt`), but nothing that was *about* the message survives —
 * attachments, links, mentions, edit history, reactions, bookmarks, pins and
 * protected-message views all go with the text.
 *
 * Safe on every instance at once: rows are claimed with `FOR UPDATE SKIP
 * LOCKED`, so two sweeps take disjoint batches instead of waiting on or
 * repeating each other. Exported so tests drive one pass instead of a timer.
 */
export async function expireDueMessages(now = new Date()): Promise<number> {
	let erased = 0;

	for (;;) {
		const batch = await prisma.$transaction(async (transaction) => {
			const rows = await transaction.$queryRaw<ExpiringRow[]>`
				SELECT id, "conversationId"
				FROM "Message"
				WHERE "expiresAt" <= ${now} AND "deletedAt" IS NULL
				ORDER BY "expiresAt"
				LIMIT ${EXPIRY_BATCH_SIZE}
				FOR UPDATE SKIP LOCKED
			`;
			if (rows.length === 0) return { rows, attachmentIds: [], pinnedConversationIds: [] };

			const ids = rows.map((row) => row.id);
			const attachments = await transaction.attachment.findMany({
				where: { messageId: { in: ids } },
				select: { id: true },
			});
			const pins = await transaction.pinnedMessage.findMany({
				where: { messageId: { in: ids } },
				select: { conversationId: true },
			});
			const where = { messageId: { in: ids } };
			await transaction.attachment.deleteMany({ where });
			await transaction.messageLink.deleteMany({ where });
			await transaction.messageMention.deleteMany({ where });
			await transaction.messageEdit.deleteMany({ where });
			await transaction.messageReaction.deleteMany({ where });
			await transaction.messageStar.deleteMany({ where });
			await transaction.messageView.deleteMany({ where });
			await transaction.pinnedMessage.deleteMany({ where });
			await transaction.$executeRaw`
				UPDATE "Message" SET content = '', "deletedAt" = ${now}
				WHERE id IN (${Prisma.join(ids)})
			`;

			return {
				rows,
				attachmentIds: attachments.map((attachment) => attachment.id),
				pinnedConversationIds: [...new Set(pins.map((pin) => pin.conversationId))],
			};
		});
		if (batch.rows.length === 0) break;
		erased += batch.rows.length;

		// After the commit, for the reason `deleteMessage` gives: a file removed
		// before a rollback is a broken image; a file left after a crash is bytes
		// the orphan sweep reclaims.
		for (const attachmentId of batch.attachmentIds) {
			await deleteAttachment(attachmentId).catch((error: unknown) => {
				logger.error({ err: error, attachmentId }, "failed to remove an expired message's file");
			});
		}

		const io = getIO();
		for (const row of batch.rows) {
			io.to(row.conversationId).emit("message:expired", {
				conversationId: row.conversationId,
				messageId: row.id,
			});
		}
		for (const conversationId of batch.pinnedConversationIds) {
			io.to(conversationId).emit("message:pins-updated", {
				conversationId,
				pinnedMessages: await loadPinnedMessages(conversationId),
			});
		}
		if (batch.rows.length < EXPIRY_BATCH_SIZE) break;
	}

	return erased;
}

/**
 * Runs `expireDueMessages` on a timer, one pass at a time.
 *
 * A pass that is still running when the next tick fires is not doubled up —
 * the tick is skipped — so a slow disk cannot pile sweeps on top of each other.
 * `unref` so the timer never holds a test or a shutting-down process open.
 */
export function startMessageExpirySweeper(): NodeJS.Timeout {
	let isRunning = false;
	const timer = setInterval(() => {
		if (isRunning) return;
		isRunning = true;
		expireDueMessages()
			.then((erased) => {
				if (erased > 0) logger.info({ erased }, "expired messages erased");
			})
			.catch((error: unknown) => logger.error({ err: error }, "message expiry sweep failed"))
			.finally(() => {
				isRunning = false;
			});
	}, MESSAGE_EXPIRY_SWEEP_MS);
	timer.unref();

	return timer;
}
