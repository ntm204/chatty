import { useEffect, useRef, useState } from "react";
import {
	PREVIEW_OPENING,
	PREVIEW_REPLY_LINES,
	PREVIEW_SEND_INTERVAL_MS,
	PREVIEW_SENT_LINES,
	PREVIEW_VISIBLE_MESSAGES,
} from "../constants/theme-preview";
import type { PreviewMessage } from "../types/theme-preview";

interface PreviewConversation {
	messages: PreviewMessage[];
	/** Changes once per sent sample message — the wallpaper's cue to flow. */
	flowKey: string;
}

/**
 * The theme picker's sample conversation, playing itself: every few seconds it
 * sends a line, and now and then a reply arrives, so a theme is judged in
 * motion — the wallpaper flowing, bubbles arriving — not as a still swatch.
 * Still under reduced motion: the opening conversation, nothing sent.
 */
export function usePreviewConversation(): PreviewConversation {
	const [messages, setMessages] = useState(PREVIEW_OPENING);
	const [sentCount, setSentCount] = useState(0);
	const sentRef = useRef(0);

	useEffect(() => {
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		const timer = window.setInterval(() => {
			const count = sentRef.current;
			sentRef.current = count + 1;
			setSentCount(count + 1);
			setMessages((current) => {
				const id = (current.at(-1)?.id ?? 0) + 1;
				const sent = { id, text: PREVIEW_SENT_LINES[count % PREVIEW_SENT_LINES.length]!, isMine: true };
				const isReplyTurn = count % 2 === 1;
				const reply = isReplyTurn
					? [
							{
								id: id + 1,
								text: PREVIEW_REPLY_LINES[(count >> 1) % PREVIEW_REPLY_LINES.length]!,
								isMine: false,
							},
						]
					: [];

				return [...current, sent, ...reply].slice(-PREVIEW_VISIBLE_MESSAGES);
			});
		}, PREVIEW_SEND_INTERVAL_MS);

		return () => window.clearInterval(timer);
	}, []);

	return { messages, flowKey: String(sentCount) };
}
