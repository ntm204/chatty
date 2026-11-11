import type { AttachmentDTO } from "@chatty/shared-types";
import { MAX_ATTACHMENT_DISPLAY_HEIGHT, MAX_ATTACHMENT_DISPLAY_WIDTH } from "../../constants/attachment";

/** Uses the small derivative anywhere an image is only being previewed. */
export function getAttachmentPreviewUrl(attachment: AttachmentDTO): string {
	return attachment.thumbUrl ?? attachment.url;
}

export interface DisplaySize {
	width: number;
	height: number;
}

/**
 * Fits an image inside the bubble's box without distorting it.
 *
 * Computed rather than left to CSS `max-width` because the result goes on the
 * `<img>` element's own width/height attributes: the browser reserves that box
 * before any bytes arrive, so a picture loading halfway up a conversation does
 * not shove everything below it down as it decodes.
 *
 * Never enlarges — a 40px sticker stays 40px rather than being blown up to fill
 * the width.
 */
export function getAttachmentDisplaySize(width: number, height: number): DisplaySize {
	// Guards a division by zero on a malformed row, and a negative scale on a
	// nonsensical one. Neither should reach here; both would render as NaN.
	if (width <= 0 || height <= 0) {
		return { width: MAX_ATTACHMENT_DISPLAY_WIDTH, height: MAX_ATTACHMENT_DISPLAY_WIDTH };
	}

	const scale = Math.min(MAX_ATTACHMENT_DISPLAY_WIDTH / width, MAX_ATTACHMENT_DISPLAY_HEIGHT / height, 1);

	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function formatBytes(byteSize: number): string {
	if (byteSize < 1024) return `${byteSize} B`;
	if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;

	return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}
