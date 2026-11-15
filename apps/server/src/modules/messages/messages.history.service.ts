/**
 * Reading a conversation's messages: paging in either direction and the window
 * around one message, each marked with the viewer's own bookmarks.
 */
import type { MessageContextDTO, MessageDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { unexpiredMessageWhere } from "./messages.lifecycle.js";
import { messageSelect, toMessageDTO } from "./messages.mapper.js";
import type { ListMessagesQuery, MessageContextQuery } from "./messages.schema.js";

/**
 * The messages strictly before or after one message, in (createdAt, id) order.
 *
 * Written out rather than left to Prisma's `cursor` + `skip: 1`, which assumes
 * the cursor row is itself in the filtered result and skips it. Since messages
 * expire (ADR 0023), the oldest message a client holds can stop matching the
 * filter between its last page and this request — and `skip: 1` would then drop
 * a real message instead. A missing cursor row reads as "nothing on that side".
 */
async function beyondCursor(cursorId: string, direction: "older" | "newer"): Promise<Prisma.MessageWhereInput> {
	const cursor = await prisma.message.findUnique({ where: { id: cursorId }, select: { createdAt: true } });
	if (!cursor) return { id: { in: [] } };

	return direction === "older"
		? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursorId } }] }
		: { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursorId } }] };
}

/** One viewer's view of a conversation: the messages they have not hidden. */
function visibleTo(currentUserId: string, conversationId: string): Prisma.MessageWhereInput {
	return { conversationId, hiddenFor: { none: { userId: currentUserId } } };
}

export async function listMessages(
	currentUserId: string,
	conversationId: string,
	query: ListMessagesQuery,
): Promise<MessageDTO[]> {
	await assertParticipant(currentUserId, conversationId);
	if (query.after) {
		const newer = await prisma.message.findMany({
			where: {
				...visibleTo(currentUserId, conversationId),
				AND: [unexpiredMessageWhere(), await beyondCursor(query.after, "newer")],
			},
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: query.limit,
			select: messageSelect,
		});

		return withViewerBookmarks(
			currentUserId,
			newer.map((message) => toMessageDTO(message, currentUserId)),
		);
	}

	const messages = await prisma.message.findMany({
		where: {
			...visibleTo(currentUserId, conversationId),
			// `before` is the id of the oldest message the client already has.
			AND: [unexpiredMessageWhere(), ...(query.before ? [await beyondCursor(query.before, "older")] : [])],
		},
		// Newest first so `take` returns the most recent page; the client reverses
		// for display. Backed by @@index([conversationId, createdAt]).
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit,
		select: messageSelect,
	});

	return withViewerBookmarks(
		currentUserId,
		messages.map((message) => toMessageDTO(message, currentUserId)),
	);
}

/**
 * Marks which of a page's messages the viewer has bookmarked, so the thread's
 * menu can offer "Remove bookmark" without a second round trip per message.
 */
async function withViewerBookmarks(userId: string, messages: MessageDTO[]): Promise<MessageDTO[]> {
	if (messages.length === 0) return messages;
	const stars = await prisma.messageStar.findMany({
		where: { userId, messageId: { in: messages.map((message) => message.id) } },
		select: { messageId: true },
	});
	const bookmarked = new Set(stars.map((star) => star.messageId));

	return messages.map((message) => ({ ...message, isBookmarked: bookmarked.has(message.id) }));
}

export async function getMessageContext(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	query: MessageContextQuery,
): Promise<MessageContextDTO> {
	await assertParticipant(currentUserId, conversationId);
	const where = { AND: [visibleTo(currentUserId, conversationId), unexpiredMessageWhere()] };
	const current = await prisma.message.findFirst({ where: { id: messageId, ...where }, select: messageSelect });
	if (!current) throw new NotFoundError("Message not found");

	const olderLimit = Math.floor(query.limit / 2);
	const newerLimit = query.limit - olderLimit - 1;
	const [older, newer] = await Promise.all([
		prisma.message.findMany({
			where: { AND: [...where.AND, await beyondCursor(messageId, "older")] },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: olderLimit + 1,
			select: messageSelect,
		}),
		prisma.message.findMany({
			where: { AND: [...where.AND, await beyondCursor(messageId, "newer")] },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: newerLimit + 1,
			select: messageSelect,
		}),
	]);

	return {
		messages: await withViewerBookmarks(
			currentUserId,
			[...older.slice(0, olderLimit).reverse(), current, ...newer.slice(0, newerLimit)].map((message) =>
				toMessageDTO(message, currentUserId),
			),
		),
		hasMoreOlder: older.length > olderLimit,
		hasMoreNewer: newer.length > newerLimit,
	};
}
