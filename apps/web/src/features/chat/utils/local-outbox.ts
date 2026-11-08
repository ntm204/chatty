import type { AttachmentDTO } from "@chatty/shared-types";
import type { LocalOutboxMessage } from "@/lib/local-chat-store";
import type { ThreadMessage } from "../types/thread-message";

export async function toLocalOutboxMessage(
	draft: ThreadMessage,
	userId: string,
	files: File[],
): Promise<LocalOutboxMessage> {
	return {
		id: draft.id,
		userId,
		conversationId: draft.conversationId,
		author: draft.author!,
		content: draft.content,
		replyTo: draft.replyTo ? { ...draft.replyTo, attachmentUrl: null } : null,
		mentionedUserIds: draft.mentionedUserIds,
		createdAt: draft.createdAt,
		attachments: await Promise.all(
			files.map(async (file, index) => ({
				bytes: await file.arrayBuffer(),
				name: file.name,
				type: file.type,
				lastModified: file.lastModified,
				width: draft.attachments[index]?.width ?? null,
				height: draft.attachments[index]?.height ?? null,
			})),
		),
	};
}

export function restoreLocalOutboxMessage(record: LocalOutboxMessage): {
	draft: ThreadMessage;
	files: File[];
	urls: string[];
} {
	const files = record.attachments.map(
		(attachment) =>
			new File([attachment.bytes], attachment.name, {
				type: attachment.type,
				lastModified: attachment.lastModified,
			}),
	);
	const urls = files.map((file) => URL.createObjectURL(file));
	const attachments: AttachmentDTO[] = record.attachments.map((attachment, index) => ({
		id: `${record.id}:attachment:${String(index)}`,
		kind: "image",
		url: urls[index]!,
		thumbUrl: null,
		width: attachment.width,
		height: attachment.height,
		byteSize: attachment.bytes.byteLength,
		fileName: attachment.name,
		mediaType: attachment.type,
		durationMs: null,
		waveform: [],
	}));

	return {
		files,
		urls,
		draft: {
			id: record.id,
			conversationId: record.conversationId,
			kind: "user",
			author: record.author,
			content: record.content,
			attachments,
			isSticker: false,
			stickerKey: null,
			isForwarded: false,
			mentionedUserIds: record.mentionedUserIds,
			createdAt: record.createdAt,
			authorActionExpiresAt: null,
			editedAt: null,
			deletedAt: null,
			reactions: [],
			replyTo: record.replyTo,
			deliveryState: "pending",
		},
	};
}
