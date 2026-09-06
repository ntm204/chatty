import { DRAFT_CHANGED_EVENT } from "../constants/draft";

export function getDraftPreview(raw: string | null): string | null {
	try {
		const draft: unknown = raw ? JSON.parse(raw) : null;
		if (!draft || typeof draft !== "object" || !("content" in draft) || typeof draft.content !== "string") {
			return null;
		}
		const text = draft.content.replace(/\s+/gu, " ").trim();

		return (
			text || ("replyToId" in draft && typeof draft.replyToId === "string" && draft.replyToId ? "Reply" : null)
		);
	} catch {
		return null;
	}
}

export function announceDraftPreview(conversationId: string, content: string, replyToId: string | null) {
	window.dispatchEvent(
		new CustomEvent(DRAFT_CHANGED_EVENT, {
			detail: { conversationId, preview: getDraftPreview(JSON.stringify({ content, replyToId })) },
		}),
	);
}
