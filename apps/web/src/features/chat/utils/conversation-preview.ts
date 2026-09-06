import type { MessageDTO } from "@chatty/shared-types";
import { DELETED_MESSAGE_TEXT, EMPTY_CONVERSATION_TEXT } from "../constants/message";
import { getAttachmentPreviewText } from "./attachment-preview-text";

/**
 * The one line of a conversation shown under its name in the sidebar.
 *
 * A message is allowed to be a picture with nothing written on it, and the row
 * used to render that as an empty line — which reads as a conversation with
 * nothing in it, the one thing it is definitely not. A tombstone gets the same
 * sentence the thread shows, rather than the empty string the server left behind.
 */
export function getConversationPreview(lastMessage: MessageDTO | null): string {
	if (!lastMessage) return EMPTY_CONVERSATION_TEXT;
	if (lastMessage.deletedAt) return DELETED_MESSAGE_TEXT;
	if (lastMessage.content) return lastMessage.content;
	if (lastMessage.attachments.length > 0) return getAttachmentPreviewText(lastMessage.attachments);

	return EMPTY_CONVERSATION_TEXT;
}
