import type { MessageDTO, MessageReplyDTO, ReactionDTO, ReactionEmoji } from "@chatty/shared-types";
import type { AttachmentKind as PrismaAttachmentKind, MessageKind } from "@prisma/client";
import { buildAttachmentUrl, buildAttachmentUrls } from "../../lib/attachment-storage.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";
import { MESSAGE_AUTHOR_ACTION_WINDOW_MS } from "./messages.constants.js";

/**
 * How a message row becomes a `MessageDTO`, and which columns that needs.
 *
 * A fifth file in a module the conventions describe as four, for one reason:
 * `conversations.service` selects a `lastMessage` and has to produce the same
 * shape, and it cannot import this from `messages.service` because
 * `messages.service` already imports `assertParticipant` from
 * `conversations.service`. That cycle is not merely untidy — `conversationSelect`
 * is a module-level const built from `messageSelect`, so whichever of the two
 * loaded second would read it during the other's temporal dead zone and crash
 * on a startup ordering nobody chose.
 *
 * Splitting the mapper out breaks the cycle instead of hiding it: this file
 * imports neither service, so both can import it.
 *
 * Keeping one copy matters beyond the cycle. Two column lists for one DTO is how
 * a field ends up rendered on a message in the chat and missing on the very same
 * message in the sidebar.
 */

interface AttachmentRow {
	id: string;
	kind: PrismaAttachmentKind;
	mediaType: string;
	fileName: string | null;
	width: number | null;
	height: number | null;
	byteSize: number;
	durationMs: number | null;
	waveform: number[];
	hasThumbnail: boolean;
}

interface ReactionRow {
	userId: string;
	emoji: string;
}

/**
 * The parent of a reply, read shallowly.
 *
 * Deliberately not `MessageRow`: nesting the full select into itself would make
 * every message carry its parent's parent, and a thread five replies deep would
 * send the whole chain down the wire to render one quoted line. One level, and
 * only the columns the quote shows.
 */
interface ReplyParentRow {
	id: string;
	content: string;
	deletedAt: Date | null;
	author: { displayName: string } | null;
	/** At most one, because a quote shows a thumbnail rather than a gallery. */
	attachments: { id: string }[];
}

export interface MessageRow {
	id: string;
	conversationId: string;
	kind: MessageKind;
	/** Null on a system message, which nobody wrote. */
	author: UserRow | null;
	content: string;
	createdAt: Date;
	editedAt: Date | null;
	deletedAt: Date | null;
	isSticker: boolean;
	stickerKey: string | null;
	isForwarded: boolean;
	attachments: AttachmentRow[];
	reactions: ReactionRow[];
	mentions: { userId: string }[];
	replyTo: ReplyParentRow | null;
}

export const messageSelect = {
	id: true,
	conversationId: true,
	kind: true,
	// The whole author, not their id. Resolving the id against the conversation's
	// participants — which is what the client used to do — loses the name and the
	// avatar of everyone who has since left the group, while their messages stay.
	// One join per page of messages is the price of history that keeps its faces.
	author: { select: userSelect },
	content: true,
	createdAt: true,
	editedAt: true,
	deletedAt: true,
	isSticker: true,
	stickerKey: true,
	isForwarded: true,
	// Ordered by the column the sender's choice was written to, not by
	// `createdAt`: a message's images are inserted in one transaction and share a
	// timestamp to the millisecond, so ordering by time would let a gallery
	// shuffle itself between two reads of the same message.
	attachments: {
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
		},
		orderBy: { position: "asc" },
	},
	// Oldest first, which is what makes the chip order stable: a kind holds the
	// position it was first used in rather than hopping about as counts change
	// under it. Grouping happens in `toReactionDTOs`, not in SQL — the rows are a
	// handful per message and a groupBy per message would be a second query.
	reactions: { select: { userId: true, emoji: true }, orderBy: { createdAt: "asc" } },
	mentions: { select: { userId: true } },
	// One level deep. See `ReplyParentRow`.
	replyTo: {
		select: {
			id: true,
			content: true,
			deletedAt: true,
			author: { select: { displayName: true } },
			// Only the first, and only to draw a thumbnail beside the quote. A
			// reply points at a message; it does not re-show the whole gallery.
			attachments: {
				where: { kind: "IMAGE" },
				select: { id: true },
				orderBy: { position: "asc" },
				take: 1,
			},
		},
	},
} as const;

/**
 * Rolls the reaction rows up into one entry per emoji.
 *
 * A `Map` rather than an object literal because insertion order is the contract
 * here — the rows arrive oldest-first and the chips render in that order, so a
 * chip does not jump sideways when somebody else reacts. An object literal would
 * also reorder any emoji that happened to look like an array index to V8.
 */
function toReactionDTOs(rows: ReactionRow[]): ReactionDTO[] {
	const byEmoji = new Map<ReactionEmoji, string[]>();
	for (const row of rows) {
		const userIds = byEmoji.get(row.emoji);
		if (userIds) userIds.push(row.userId);
		else byEmoji.set(row.emoji, [row.userId]);
	}

	return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

/**
 * Quotes the parent of a reply as it stands *now*.
 *
 * A deleted parent surrenders its text here rather than in the client: the
 * server already empties `content` on delete, and this makes the quote obey the
 * same rule even if a stale row ever slipped through.
 */
function toReplyDTO(row: ReplyParentRow): MessageReplyDTO {
	const isDeleted = row.deletedAt !== null;
	const firstImage = isDeleted ? undefined : row.attachments[0];

	return {
		id: row.id,
		authorName: row.author?.displayName ?? null,
		content: isDeleted ? "" : row.content,
		hasAttachment: firstImage !== undefined,
		attachmentUrl: firstImage ? buildAttachmentUrl(firstImage.id) : null,
		isDeleted,
	};
}

export function toMessageDTO(row: MessageRow): MessageDTO {
	return {
		id: row.id,
		conversationId: row.conversationId,
		kind: row.kind === "SYSTEM" ? "system" : "user",
		author: row.author ? toUserDTO(row.author) : null,
		content: row.content,
		// The URLs are built per response rather than stored: each carries a signed
		// token that expires, so a cached copy would rot.
		isSticker: row.isSticker,
		stickerKey: row.stickerKey,
		isForwarded: row.isForwarded,
		mentionedUserIds: row.mentions.map((mention) => mention.userId),
		attachments: row.attachments.map((attachment) => ({
			id: attachment.id,
			kind: attachment.kind === "IMAGE" ? "image" : attachment.kind === "FILE" ? "file" : "audio",
			...buildAttachmentUrls(attachment.id, attachment.kind === "IMAGE" && attachment.hasThumbnail),
			width: attachment.width,
			height: attachment.height,
			byteSize: attachment.byteSize,
			fileName: attachment.fileName,
			mediaType: attachment.mediaType,
			durationMs: attachment.durationMs,
			waveform: attachment.waveform,
		})),
		createdAt: row.createdAt.toISOString(),
		authorActionExpiresAt:
			row.kind === "USER"
				? new Date(row.createdAt.getTime() + MESSAGE_AUTHOR_ACTION_WINDOW_MS).toISOString()
				: null,
		editedAt: row.editedAt?.toISOString() ?? null,
		deletedAt: row.deletedAt?.toISOString() ?? null,
		// A tombstone drops its reactions along with its text: they were left on
		// something that no longer says anything, and leaving three hearts under
		// "This message was deleted" reads as approval of the deletion.
		reactions: row.deletedAt ? [] : toReactionDTOs(row.reactions),
		replyTo: row.replyTo ? toReplyDTO(row.replyTo) : null,
	};
}
