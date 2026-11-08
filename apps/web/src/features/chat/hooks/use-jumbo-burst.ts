import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { BURST_EMOJI, BURST_FRESH_MS } from "../constants/emoji-burst";
import { playEmojiBurst } from "../utils";

/**
 * Telegram's interactive emoji, for a message that is nothing but 🎉, ❤️ or 👍:
 * it pops in and bursts across the screen when it arrives live, and does it
 * again when tapped. History scrolled into view stays quiet — only a message
 * newer than `BURST_FRESH_MS` when it appears plays by itself.
 */
export function useJumboBurst(content: string, isJumbo: boolean, createdAt: string) {
	const emoji = content.trim();
	const isBurstable = isJumbo && (BURST_EMOJI as readonly string[]).includes(emoji);
	const elementRef = useRef<HTMLElement | null>(null);
	const [popKey, setPopKey] = useState(0);

	// Once, when the message first appears: a later render must not replay it.
	const hasPlayedRef = useRef(false);
	useEffect(() => {
		if (hasPlayedRef.current) return;
		hasPlayedRef.current = true;
		if (!isBurstable || Date.now() - Date.parse(createdAt) > BURST_FRESH_MS) return;
		const element = elementRef.current;
		if (!element) return;
		setPopKey(1);
		playEmojiBurst(emoji, element.getBoundingClientRect());
	}, [createdAt, emoji, isBurstable]);

	function replay(event: MouseEvent<HTMLElement>) {
		if (!isBurstable) return;
		setPopKey((key) => key + 1);
		playEmojiBurst(emoji, event.currentTarget.getBoundingClientRect());
	}

	return { elementRef, isBurstable, popKey, replay };
}
