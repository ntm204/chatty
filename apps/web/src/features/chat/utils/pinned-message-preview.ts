import type { PinnedMessageDTO } from "@chatty/shared-types";

/** Captions supplement attachment identity; they are never used as an image's title. */
export function getPinnedMessagePreview(pin: PinnedMessageDTO): string {
	const message = pin.message;
	const attachment = message?.attachments[0];
	if (attachment?.kind === "image") {
		return message && message.attachments.length > 1 ? `${message.attachments.length} photos` : "Photo";
	}
	if (attachment?.kind === "audio") return "Voice message";
	if (attachment) return attachment.fileName || "File";
	if (message?.isSticker) return "Sticker";

	return pin.content || "Message";
}

/** Who to credit a pin's original message to — "You" for the viewer's own. */
export function getPinnedMessageAuthorLabel(pin: PinnedMessageDTO, currentUserId: string): string {
	const author = pin.message?.author;
	if (!author) return "Pinned message";

	return author.id === currentUserId ? "You" : author.displayName;
}
