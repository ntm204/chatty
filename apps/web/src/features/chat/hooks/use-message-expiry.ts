import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { MAX_BROWSER_TIMEOUT_MS } from "../constants/message";
import type { ThreadMessage } from "../types/thread-message";
import { isExpiredMessage } from "@/utils/is-expired-message";

/**
 * Takes disappearing messages off the thread at their `expiresAt`.
 *
 * One timer, for the soonest expiry on screen, re-armed whenever the list
 * changes — not one per message. The server's `message:expired` arrives a sweep
 * later; this is what makes "disappears after 24 hours" true to the second on
 * the reader's own clock, offline included.
 */
export function useMessageExpiry(messages: ThreadMessage[], setMessages: Dispatch<SetStateAction<ThreadMessage[]>>) {
	useEffect(() => {
		const soonest = Math.min(
			...messages.flatMap((message) => (message.expiresAt ? [Date.parse(message.expiresAt)] : [])),
		);
		if (!Number.isFinite(soonest)) return;

		const timer = setTimeout(
			() =>
				setMessages((current) => {
					const kept = current.filter((message) => !isExpiredMessage(message));

					// Same array when nothing went, so a clamped early wake-up re-arms without a render.
					return kept.length === current.length ? current : kept;
				}),
			// Clamped: a 90-day timer overflows setTimeout's 32-bit delay and would fire at once.
			Math.min(Math.max(soonest - Date.now(), 0), MAX_BROWSER_TIMEOUT_MS),
		);

		return () => clearTimeout(timer);
	}, [messages, setMessages]);
}
