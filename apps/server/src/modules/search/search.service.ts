import type { MessageSearchPageDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { messageSelect, toMessageDTO } from "../messages/messages.mapper.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { SearchMessagesQuery } from "./search.schema.js";

/**
 * Finding a message across every conversation the caller is in.
 *
 * Its own module rather than a route on `messages`, because the messages router
 * is mounted under `/conversations/:conversationId` — everything in it is scoped
 * to one conversation by its path. This is the opposite: the whole point is not
 * knowing which conversation the answer is in.
 */

/** Ids of matching messages, in the order they will be returned. */
interface MatchRow {
	id: string;
}

/**
 * Runs the actual match, and returns only ids.
 *
 * Two queries rather than one, deliberately. This one is raw SQL because
 * `@@ websearch_to_tsquery` is not something Prisma's query builder can express,
 * and raw SQL cannot produce the nested author/attachment/participant shape the
 * DTO needs without hand-writing a join and a mapper that would then have to be
 * kept in step with `messages.mapper.ts`. Ids cross the gap cheaply, and the
 * second query is an ordinary Prisma read using the select every other message
 * response already shares.
 *
 * `websearch_to_tsquery`, not `to_tsquery`: it accepts whatever a person types.
 * `to_tsquery` throws a syntax error on a bare space, which would turn a normal
 * search into a 500 the first time anyone typed two words.
 *
 * `immutable_unaccent` wraps the search term because the stored vector is built
 * from the same function — see the phase 20 migration. Both sides or neither:
 * stripping accents from only the column would make `hẹn` fail to find its own
 * message, which is a worse bug than the one being fixed.
 */
async function findMatchingMessageIds(currentUserId: string, query: SearchMessagesQuery): Promise<string[]> {
	const rows = await prisma.$queryRaw<MatchRow[]>`
		SELECT m."id"
		FROM "Message" m
		JOIN "ConversationParticipant" p
			ON p."conversationId" = m."conversationId" AND p."userId" = ${currentUserId}
		WHERE m."searchVector" @@ websearch_to_tsquery('simple', immutable_unaccent(${query.query}))
			-- A tombstone has an empty content and so an empty vector; excluded
			-- explicitly anyway, because "cannot match" and "must not be returned"
			-- are different promises and only one of them survives a schema change.
			AND m."deletedAt" IS NULL
			-- "An added Binh" is the log of something that happened, not something
			-- anyone said. Searching your messages should not surface it.
				AND m."kind" = 'USER'
				-- A protected message's words are withheld from its recipients, and a
				-- match — even one that only returns the cover — would tell them what
				-- it says. Its author does not need search to find a 24-hour message.
				AND NOT m."isProtected"
				AND (m."expiresAt" IS NULL OR m."expiresAt" > ${new Date()})
				AND NOT EXISTS (
					SELECT 1 FROM "MessageHiddenFor" h
					WHERE h."messageId" = m."id" AND h."userId" = ${currentUserId}
				)
				${query.conversationId ? Prisma.sql`AND m."conversationId" = ${query.conversationId}` : Prisma.empty}
				${
					query.before && query.beforeId
						? Prisma.sql`AND (m."createdAt", m."id") < (${new Date(query.before)}, ${query.beforeId})`
						: Prisma.empty
				}
		-- Newest first, not by rank. In a chat, the thing you are looking for is
		-- almost always the recent one, and a relevance score would put a
		-- three-year-old message above this morning's for saying the word twice.
		ORDER BY m."createdAt" DESC, m."id" DESC
		LIMIT ${query.limit + 1}
	`;

	return rows.map((row) => row.id);
}

/**
 * Messages matching `query`, from conversations the caller is in **now**.
 *
 * The membership join is the authorization, and it is in the query rather than
 * after it for the reason every other list in this app puts it there: filtering
 * afterwards means the database returned rows the caller may not see, and the
 * only thing standing between that and a response is a line of application code.
 *
 * Leaving a conversation therefore removes it from your search, which is the
 * same rule the sidebar follows — a group you left disappears from it entirely.
 */
export async function searchMessages(currentUserId: string, query: SearchMessagesQuery): Promise<MessageSearchPageDTO> {
	const matchingIdsWithLookahead = await findMatchingMessageIds(currentUserId, query);
	const hasMore = matchingIdsWithLookahead.length > query.limit;
	const matchingIds = matchingIdsWithLookahead.slice(0, query.limit);
	if (matchingIds.length === 0) return { results: [], hasMore: false };

	const messages = await prisma.message.findMany({
		where: { id: { in: matchingIds } },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		select: {
			...messageSelect,
			conversation: {
				select: {
					id: true,
					isGroup: true,
					name: true,
					participants: { select: { user: { select: userSelect } } },
				},
			},
		},
	});

	const results: MessageSearchResultDTO[] = messages.map((message) => ({
		message: toMessageDTO(message, currentUserId),
		conversation: {
			id: message.conversation.id,
			isGroup: message.conversation.isGroup,
			name: message.conversation.name,
			participants: message.conversation.participants.map((participant) => toUserDTO(participant.user)),
		},
	}));

	return { results, hasMore };
}
