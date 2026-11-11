import { useEffect } from "react";
import { api } from "@/api/client";

/**
 * Tells the server the open conversation has been read up to `newestMessageId`.
 *
 * Gated on the tab being visible, which is the difference between a read
 * receipt that means something and one that only means "a browser had this open
 * somewhere". Re-checked on `visibilitychange` rather than only on mount,
 * because the common case is a message arriving in a background tab: it is
 * marked when the user actually comes back to it.
 *
 * Sending is safe to repeat — the server refuses to move a marker backwards and
 * only broadcasts when it actually moved, so a redundant call costs one request
 * and changes nothing.
 */
export function useMarkRead(conversationId: string | null, newestMessageId: string | undefined): void {
	useEffect(() => {
		if (!conversationId || !newestMessageId) return;

		function markRead() {
			if (document.visibilityState !== "visible") return;

			void api.markConversationRead(conversationId!, newestMessageId!).catch(() => {
				// Deliberately silent. Nothing the user asked for has failed — they
				// can still read and send — and the next message, or reopening the
				// conversation, retries it anyway. A visible error here would be
				// alarming out of all proportion to a badge that stays lit.
			});
		}

		markRead();
		document.addEventListener("visibilitychange", markRead);

		return () => document.removeEventListener("visibilitychange", markRead);
	}, [conversationId, newestMessageId]);
}
