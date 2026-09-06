import type { AttachmentDTO } from "@chatty/shared-types";
import { ATTACHMENT_PREVIEW_TEXT } from "../constants/message";

/**
 * What an attachment-only message says where its text would go — the
 * sidebar preview, and the composer's reply slot.
 *
 * It counts, because "Sent an image" under a conversation somebody just sent
 * nine photos to is a small lie that the sidebar is the last place to tell: the
 * preview exists precisely so the reader knows what is waiting without opening
 * the thread.
 */
export function getAttachmentPreviewText(attachments: AttachmentDTO[]): string {
	if (attachments.some((attachment) => attachment.kind === "audio")) return "Voice message";
	if (attachments.some((attachment) => attachment.kind === "file")) return "Sent a file";

	return attachments.length > 1 ? `Sent ${attachments.length} images` : ATTACHMENT_PREVIEW_TEXT;
}
