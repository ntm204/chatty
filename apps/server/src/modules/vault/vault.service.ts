import type {
	AttachmentPageDTO,
	ConversationVaultSummaryDTO,
	MessageLinkPageDTO,
	MessageSearchResultDTO,
	SavedMessagePageDTO,
} from "@chatty/shared-types";
import { Prisma } from "@prisma/client";
import { buildAttachmentUrls } from "../../lib/attachment-storage.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { unexpiredMessageWhere } from "../messages/messages.lifecycle.js";
import { messageSelect, toMessageDTO } from "../messages/messages.mapper.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { ListLinksQuery, ListMediaQuery, ListSavedQuery } from "./vault.schema.js";

const KIND_TO_COLUMN = { image: "IMAGE", file: "FILE", audio: "AUDIO" } as const;

/**
 * Whether the message behind a vault row may be listed: not protected, not expired.
 *
 * A protected message's photos are withheld from everyone until each recipient
 * opens it, and the vault shows the whole conversation's media to everyone — so
 * they never appear here at all. An expired message no longer exists, whether or
 * not the sweep has erased its files yet. See ADR 0023.
 */
function listableMessage(messageIdColumn: Prisma.Sql, now: Date): Prisma.Sql {
	return Prisma.sql`EXISTS (
		SELECT 1 FROM "Message" listed
		WHERE listed.id = ${messageIdColumn}
			AND NOT listed."isProtected"
			AND (listed."expiresAt" IS NULL OR listed."expiresAt" > ${now})
	)`;
}

export async function listConversationMedia(
	userId: string,
	conversationId: string,
	query: ListMediaQuery,
): Promise<AttachmentPageDTO> {
	await assertParticipant(userId, conversationId);
	const before = query.before
		? await prisma.attachment.findFirst({
				where: {
					id: query.before,
					conversationId,
					message: { hiddenFor: { none: { userId } } },
				},
				select: { createdAt: true, id: true },
			})
		: null;
	if (query.before && !before) throw new NotFoundError("Attachment not found");

	const ids = await prisma.$queryRaw<{ id: string }[]>`
		SELECT attachment.id
		FROM "Attachment" attachment
		WHERE attachment."conversationId" = ${conversationId}
			AND attachment.kind = ${KIND_TO_COLUMN[query.kind]}::"AttachmentKind"
			AND NOT EXISTS (
				SELECT 1 FROM "MessageHiddenFor" hidden
				WHERE hidden."messageId" = attachment."messageId" AND hidden."userId" = ${userId}
			)
			AND ${listableMessage(Prisma.sql`attachment."messageId"`, new Date())}
			${before ? Prisma.sql`AND (attachment."createdAt", attachment.id) < (${before.createdAt}, ${before.id})` : Prisma.empty}
		ORDER BY attachment."createdAt" DESC, attachment.id DESC
		LIMIT ${query.limit + 1}
	`;
	const hasMore = ids.length > query.limit;
	const pageIds = ids.slice(0, query.limit).map((row) => row.id);
	if (pageIds.length === 0) return { items: [], hasMore: false };

	const rows = await prisma.attachment.findMany({
		where: { id: { in: pageIds } },
		select: {
			id: true,
			kind: true,
			mediaType: true,
			fileName: true,
			width: true,
			height: true,
			byteSize: true,
			durationMs: true,
			waveform: true,
			hasThumbnail: true,
			message: { select: { id: true, createdAt: true, author: { select: { displayName: true } } } },
		},
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	const items = pageIds.flatMap((id) => {
		const row = byId.get(id);
		if (!row) return [];

		return [
			{
				id: row.id,
				kind:
					row.kind === "IMAGE"
						? ("image" as const)
						: row.kind === "FILE"
							? ("file" as const)
							: ("audio" as const),
				...buildAttachmentUrls(row.id, row.kind === "IMAGE" && row.hasThumbnail),
				width: row.width,
				height: row.height,
				byteSize: row.byteSize,
				fileName: row.fileName,
				mediaType: row.mediaType,
				durationMs: row.durationMs,
				waveform: row.waveform,
				messageId: row.message.id,
				messageCreatedAt: row.message.createdAt.toISOString(),
				authorName: row.message.author?.displayName ?? null,
			},
		];
	});

	return { items, hasMore };
}

export async function listConversationLinks(
	userId: string,
	conversationId: string,
	query: ListLinksQuery,
): Promise<MessageLinkPageDTO> {
	await assertParticipant(userId, conversationId);
	if (query.before) {
		const cursor = await prisma.messageLink.findFirst({
			where: {
				id: query.before,
				conversationId,
				message: { hiddenFor: { none: { userId } }, deletedAt: null },
			},
			select: { id: true },
		});
		if (!cursor) throw new NotFoundError("Link not found");
	}
	const links = await prisma.messageLink.findMany({
		where: {
			conversationId,
			message: {
				hiddenFor: { none: { userId } },
				deletedAt: null,
				isProtected: false,
				...unexpiredMessageWhere(),
			},
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit + 1,
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: {
			id: true,
			messageId: true,
			url: true,
			createdAt: true,
			message: { select: { author: { select: { displayName: true } } } },
		},
	});

	return {
		items: links.slice(0, query.limit).map((link) => ({
			id: link.id,
			messageId: link.messageId,
			url: link.url,
			createdAt: link.createdAt.toISOString(),
			authorName: link.message.author?.displayName ?? null,
		})),
		hasMore: links.length > query.limit,
	};
}

export async function listSavedMessages(userId: string, query: ListSavedQuery): Promise<SavedMessagePageDTO> {
	if (query.conversationId) await assertParticipant(userId, query.conversationId);
	// One filter object for the cursor lookup and the page, so a cursor can never
	// validate against a wider set than the page it is paging — which is how a
	// scoped list ends up 404ing on a row it would have returned.
	const messageFilter = {
		deletedAt: null,
		hiddenFor: { none: { userId } },
		...unexpiredMessageWhere(),
		conversation: { participants: { some: { userId } } },
		...(query.conversationId && { conversationId: query.conversationId }),
	};

	if (query.before) {
		const cursor = await prisma.messageStar.findFirst({
			where: { messageId: query.before, userId, message: messageFilter },
			select: { messageId: true },
		});
		if (!cursor) throw new NotFoundError("Saved message not found");
	}
	const stars = await prisma.messageStar.findMany({
		where: { userId, message: messageFilter },
		orderBy: [{ createdAt: "desc" }, { messageId: "desc" }],
		take: query.limit + 1,
		...(query.before ? { cursor: { messageId_userId: { messageId: query.before, userId } }, skip: 1 } : {}),
		select: {
			message: {
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
			},
		},
	});
	const results: MessageSearchResultDTO[] = stars.slice(0, query.limit).map(({ message }) => ({
		message: toMessageDTO(message, userId),
		conversation: {
			id: message.conversation.id,
			isGroup: message.conversation.isGroup,
			name: message.conversation.name,
			participants: message.conversation.participants.map((participant) => toUserDTO(participant.user)),
		},
	}));

	return { results, hasMore: stars.length > query.limit };
}

/**
 * How much of each kind this conversation holds.
 *
 * One round trip rather than five parallel counts: the panel asks for this the
 * moment it opens, and every subquery is a bounded scan of the same index its
 * list pages with — `(conversationId, kind, createdAt)` on Attachment,
 * `(conversationId, createdAt)` on MessageLink.
 *
 * `COUNT(*)::int` rather than a bare COUNT, because `$queryRaw` hands a
 * PostgreSQL bigint back as a JavaScript BigInt, which `res.json()` refuses to
 * serialise — a 500 on a response whose numbers are all small by construction.
 *
 * Every predicate is the one the matching list uses, `MessageHiddenFor`
 * included. A count that ignored it would promise a file that the person asking
 * has already removed from their own view.
 */
export async function getConversationVaultSummary(
	userId: string,
	conversationId: string,
): Promise<ConversationVaultSummaryDTO> {
	await assertParticipant(userId, conversationId);
	const now = new Date();
	const rows = await prisma.$queryRaw<ConversationVaultSummaryDTO[]>`
		SELECT
			(
				SELECT COUNT(*)::int FROM "Attachment" attachment
				WHERE attachment."conversationId" = ${conversationId}
					AND attachment.kind = 'IMAGE'::"AttachmentKind"
					AND NOT EXISTS (
						SELECT 1 FROM "MessageHiddenFor" hidden
						WHERE hidden."messageId" = attachment."messageId" AND hidden."userId" = ${userId}
					)
					AND ${listableMessage(Prisma.sql`attachment."messageId"`, now)}
			) AS media,
			(
				SELECT COUNT(*)::int FROM "Attachment" attachment
				WHERE attachment."conversationId" = ${conversationId}
					AND attachment.kind = 'FILE'::"AttachmentKind"
					AND NOT EXISTS (
						SELECT 1 FROM "MessageHiddenFor" hidden
						WHERE hidden."messageId" = attachment."messageId" AND hidden."userId" = ${userId}
					)
					AND ${listableMessage(Prisma.sql`attachment."messageId"`, now)}
			) AS files,
			(
				SELECT COUNT(*)::int FROM "Attachment" attachment
				WHERE attachment."conversationId" = ${conversationId}
					AND attachment.kind = 'AUDIO'::"AttachmentKind"
					AND NOT EXISTS (
						SELECT 1 FROM "MessageHiddenFor" hidden
						WHERE hidden."messageId" = attachment."messageId" AND hidden."userId" = ${userId}
					)
					AND ${listableMessage(Prisma.sql`attachment."messageId"`, now)}
			) AS voice,
			(
				SELECT COUNT(*)::int FROM "MessageLink" link
				JOIN "Message" message ON message.id = link."messageId"
				WHERE link."conversationId" = ${conversationId}
					AND message."deletedAt" IS NULL
					AND NOT EXISTS (
						SELECT 1 FROM "MessageHiddenFor" hidden
						WHERE hidden."messageId" = link."messageId" AND hidden."userId" = ${userId}
					)
					AND ${listableMessage(Prisma.sql`link."messageId"`, now)}
			) AS links,
			(
				SELECT COUNT(*)::int FROM "MessageStar" star
				JOIN "Message" message ON message.id = star."messageId"
				WHERE star."userId" = ${userId}
					AND message."conversationId" = ${conversationId}
					AND message."deletedAt" IS NULL
					AND NOT EXISTS (
						SELECT 1 FROM "MessageHiddenFor" hidden
						WHERE hidden."messageId" = star."messageId" AND hidden."userId" = ${userId}
					)
					AND ${listableMessage(Prisma.sql`star."messageId"`, now)}
			) AS saved
	`;

	// A scalar-subquery SELECT with no FROM always returns exactly one row; the
	// fallback is here so the return type does not have to be optional.
	return rows[0] ?? { media: 0, files: 0, voice: 0, links: 0, saved: 0 };
}
