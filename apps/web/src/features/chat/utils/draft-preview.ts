import { DRAFT_CHANGED_EVENT } from "../constants/draft";
import { PROTECTED_MESSAGE_TEXT } from "../constants/message";

export function getDraftPreview(raw: string | null): string | null {
	try {
		const draft: unknown = raw ? JSON.parse(raw) : null;
		if (!draft || typeof draft !== "object" || !("content" in draft) || typeof draft.content !== "string") {
			return null;
		}
		const text = draft.content.replace(/\s+/gu, " ").trim();
		// The sidebar is read over shoulders; a draft about to be protected shows its cover.
		if (text && "isProtected" in draft && draft.isProtected === true) return PROTECTED_MESSAGE_TEXT;

		return (
			text || ("replyToId" in draft && typeof draft.replyToId === "string" && draft.replyToId ? "Reply" : null)
		);
	} catch {
		return null;
	}
}

export function announceDraftPreview(
	userId: string,
	conversationId: string,
	content: string,
	replyToId: string | null,
	isProtected = false,
) {
	window.dispatchEvent(
		new CustomEvent(DRAFT_CHANGED_EVENT, {
			detail: {
				userId,
				conversationId,
				preview: getDraftPreview(JSON.stringify({ content, replyToId, isProtected })),
			},
		}),
	);
}
