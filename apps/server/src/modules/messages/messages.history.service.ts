/**
 * Reading a conversation's messages: paging in either direction and the window
 * around one message, each marked with the viewer's own bookmarks.
 */
import type { MessageContextDTO, MessageDTO } from "@chatty/shared-types";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO } from "./messages.mapper.js";
import type { ListMessagesQuery, MessageContextQuery } from "./messages.schema.js";

export async function listMessages(
	currentUserId: string,
	conversationId: string,
	query: ListMessagesQuery,
): Promise<MessageDTO[]> {
	await assertParticipant(currentUserId, conversationId);
	if (query.after) {
		const newer = await prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: query.limit,
			cursor: { id: query.after },
			skip: 1,
			select: messageSelect,
		});

		return withViewerBookmarks(currentUserId, newer.map(toMessageDTO));
	}

	const messages = await prisma.message.findMany({
		where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
		// Newest first so `take` returns the most recent page; the client reverses
		// for display. Backed by @@index([conversationId, createdAt]).
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit,
		// `before` is the id of the oldest message the client already has.
		// `skip: 1` excludes that message itself from the next page.
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: messageSelect,
	});

	return withViewerBookmarks(currentUserId, messages.map(toMessageDTO));
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
	const target = await prisma.message.findFirst({
		where: { id: messageId, conversationId, hiddenFor: { none: { userId: currentUserId } } },
		select: { id: true },
	});
	if (!target) throw new NotFoundError("Message not found");

	const olderLimit = Math.floor(query.limit / 2);
	const newerLimit = query.limit - olderLimit - 1;
	const [older, current, newer] = await Promise.all([
		prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			cursor: { id: messageId },
			skip: 1,
			take: olderLimit + 1,
			select: messageSelect,
		}),
		prisma.message.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect }),
		prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			cursor: { id: messageId },
			skip: 1,
			take: newerLimit + 1,
			select: messageSelect,
		}),
	]);

	return {
		messages: await withViewerBookmarks(
			currentUserId,
			[...older.slice(0, olderLimit).reverse(), current, ...newer.slice(0, newerLimit)].map(toMessageDTO),
		),
		hasMoreOlder: older.length > olderLimit,
		hasMoreNewer: newer.length > newerLimit,
	};
}
