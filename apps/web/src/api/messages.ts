/**
 * Message history and sends (text, files, voice, stickers), edits, reactions, bookmarks, pins,
 * search, attachment URLs and the personal sticker tray.
 * Composed into the public `api` object in ./client.ts.
 */
import type {
	AttachmentDTO,
	EditMessageRequest,
	MessageDTO,
	MessageContextDTO,
	MessageEditDTO,
	MessageSearchPageDTO,
	SavedMessagePageDTO,
	PinnedMessageDTO,
	ReactionEmoji,
	StickerDTO,
	ToggleReactionRequest,
} from "@chatty/shared-types";
import { request, get, post, uploadMessage, ATTACHMENT_FIELD, FILE_FIELD, VOICE_FIELD, STICKER_FIELD } from "./core";

export const messagesApi = {
	/**
	 * Returns messages newest-first, so `limit` yields the most recent page.
	 * Pass `before` — the id of the oldest message already held — to walk further
	 * back. The cursor message itself is excluded.
	 */
	listMessages(
		conversationId: string,
		options: { limit: number; before?: string; after?: string },
	): Promise<MessageDTO[]> {
		const params = new URLSearchParams({ limit: String(options.limit) });
		if (options.before) params.set("before", options.before);
		if (options.after) params.set("after", options.after);

		return get<MessageDTO[]>(`/conversations/${conversationId}/messages?${params.toString()}`);
	},

	getMessageContext(conversationId: string, messageId: string, limit = 50): Promise<MessageContextDTO> {
		return get<MessageContextDTO>(
			`/conversations/${conversationId}/messages/${messageId}/context?limit=${String(limit)}`,
		);
	},

	listMessageEdits(conversationId: string, messageId: string): Promise<MessageEditDTO[]> {
		return get<MessageEditDTO[]>(`/conversations/${conversationId}/messages/${messageId}/edits`);
	},

	hideMessage(conversationId: string, messageId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/messages/${messageId}/me`, { method: "DELETE" });
	},

	/**
	 * Sends a message, with any number of images.
	 *
	 * Same endpoint either way — JSON when it is only text, multipart when there
	 * are files. One write path rather than two, so there is one place where
	 * membership is checked and one broadcast everyone renders from.
	 *
	 * Progress describes transmitted bytes only, never server confirmation.
	 */
	sendMessage(
		conversationId: string,
		content: string,
		attachments: File[] = [],
		replyToId?: string,
		mentionedUserIds: string[] = [],
		clientId?: string,
		onProgress?: (percent: number) => void,
	): Promise<MessageDTO> {
		const path = `/conversations/${conversationId}/messages`;
		if (attachments.length === 0) {
			return post<MessageDTO>(path, {
				content,
				...(replyToId ? { replyToId } : {}),
				...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
				...(clientId ? { clientId } : {}),
			});
		}

		const body = new FormData();
		// The same field name once per file: that is how multipart carries a list,
		// and why the server's field stayed singular when the column became many.
		for (const attachment of attachments) body.append(ATTACHMENT_FIELD, attachment);
		// Omitted rather than sent empty: an image with no caption is a message
		// with no text, and the server trims what it gets either way.
		if (content) body.append("content", content);
		// Multer puts non-file fields on `req.body`, so the same Zod schema reads
		// this whether the message arrived as JSON or as multipart.
		if (replyToId) body.append("replyToId", replyToId);
		if (mentionedUserIds.length > 0) body.append("mentionedUserIds", JSON.stringify(mentionedUserIds));
		if (clientId) body.append("clientId", clientId);

		return uploadMessage(conversationId, body, onProgress, "The image upload was interrupted");
	},

	sendFile(
		conversationId: string,
		file: File,
		content = "",
		onProgress?: (percent: number) => void,
		replyToId?: string,
		clientId?: string,
	): Promise<MessageDTO> {
		const body = new FormData();
		body.append(FILE_FIELD, file);
		if (clientId) body.append("clientId", clientId);
		if (content) body.append("content", content);
		if (replyToId) body.append("replyToId", replyToId);

		return uploadMessage(conversationId, body, onProgress, "The file upload was interrupted");
	},

	sendVoice(
		conversationId: string,
		recording: Blob,
		onProgress?: (percent: number) => void,
		clientId?: string,
	): Promise<MessageDTO> {
		const body = new FormData();
		body.append(VOICE_FIELD, recording, "voice-message");
		if (clientId) body.append("clientId", clientId);

		return uploadMessage(conversationId, body, onProgress, "The voice upload was interrupted");
	},

	/**
	 * Sends one of your own saved stickers.
	 *
	 * Its own method rather than an argument on `sendMessage`, because a sticker
	 * is the whole message — the server refuses it alongside text or files, and a
	 * shared signature would invite exactly that call.
	 */
	sendSticker(conversationId: string, stickerId: string, replyToId?: string, clientId?: string): Promise<MessageDTO> {
		// Built-in stickers ride the same path under a "builtin:" id and are sent by name.
		const builtin = stickerId.startsWith("builtin:") ? stickerId.slice("builtin:".length) : null;

		return post<MessageDTO>(`/conversations/${conversationId}/messages`, {
			...(builtin ? { stickerKey: builtin } : { stickerId }),
			...(clientId ? { clientId } : {}),
			...(replyToId ? { replyToId } : {}),
		});
	},

	forwardMessage(
		conversationId: string,
		sourceMessageId: string,
		clientId: string = crypto.randomUUID(),
	): Promise<MessageDTO> {
		return post<MessageDTO>(`/conversations/${conversationId}/messages`, {
			forwardOfMessageId: sourceMessageId,
			clientId,
		});
	},

	/**
	 * Rewrites the text of a message you wrote. Only the author may, and only
	 * while it stands — a deleted message is refused rather than restored.
	 *
	 * Like `sendMessage`, the returned message is not what puts it on screen: the
	 * server broadcasts `message:updated` to everyone including the editor, so
	 * one code path renders the change for all of them.
	 */
	editMessage(conversationId: string, messageId: string, content: string): Promise<MessageDTO> {
		const body: EditMessageRequest = { content };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},

	/**
	 * Deletes a message you wrote, and its image with it.
	 *
	 * Returns the tombstone rather than nothing: the message keeps its place in
	 * the conversation with its content emptied, which is what the list renders
	 * as "This message was deleted". Deleting twice is not an error.
	 */
	deleteMessage(conversationId: string, messageId: string): Promise<MessageDTO> {
		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" });
	},

	/**
	 * Sets your one reaction on this message, or takes it off if it is already this emoji.
	 *
	 * One call for both, so the caller never tracks which it is doing — the same
	 * button does both, and a client that decided for itself would disagree with
	 * the database the moment the same account reacted from a second tab.
	 *
	 * Like the other message writes, the response is not what renders it: the
	 * server broadcasts `message:updated` with the whole reaction list.
	 */
	toggleReaction(conversationId: string, messageId: string, emoji: ReactionEmoji): Promise<MessageDTO> {
		const body: ToggleReactionRequest = { emoji };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	listBookmarkedMessages(before?: string): Promise<SavedMessagePageDTO> {
		const params = new URLSearchParams({ limit: "20" });
		if (before) params.set("before", before);

		return get<SavedMessagePageDTO>(`/me/saved?${params.toString()}`);
	},

	saveMessage(conversationId: string, messageId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/messages/${messageId}/star`, { method: "PUT" });
	},

	removeBookmark(conversationId: string, messageId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/messages/${messageId}/star`, { method: "DELETE" });
	},

	pinMessage(conversationId: string, messageId: string): Promise<PinnedMessageDTO[]> {
		return request<PinnedMessageDTO[]>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
			method: "PUT",
		});
	},

	unpinMessage(conversationId: string, messageId: string): Promise<PinnedMessageDTO[]> {
		return request<PinnedMessageDTO[]>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
			method: "DELETE",
		});
	},

	/**
	 * Finds messages across every conversation you are in.
	 *
	 * Not scoped to one conversation on purpose — the point is not knowing which
	 * one the answer is in. Each result carries enough of its conversation to be
	 * labelled without a second request.
	 *
	 * Two characters minimum, enforced by the server: a one-character search
	 * matches most of the table and is never what anyone meant.
	 */
	searchMessages(
		query: string,
		limit = 20,
		conversationId?: string,
		before?: string,
		beforeId?: string,
	): Promise<MessageSearchPageDTO> {
		const params = new URLSearchParams({ query, limit: String(limit) });
		if (conversationId) params.set("conversationId", conversationId);
		if (before) params.set("before", before);
		if (beforeId) params.set("beforeId", beforeId);

		return get<MessageSearchPageDTO>(`/search/messages?${params.toString()}`);
	},

	getAttachmentUrls(attachmentId: string): Promise<Pick<AttachmentDTO, "url" | "thumbUrl">> {
		return request(`/attachments/${encodeURIComponent(attachmentId)}/urls`);
	},

	listStickers(): Promise<StickerDTO[]> {
		return get<StickerDTO[]>("/stickers");
	},

	addSticker(file: File): Promise<StickerDTO> {
		const body = new FormData();
		body.append(STICKER_FIELD, file);

		return request<StickerDTO>("/stickers", { method: "POST", body });
	},

	removeSticker(stickerId: string): Promise<void> {
		return request<void>(`/stickers/${stickerId}`, { method: "DELETE" });
	},
};
