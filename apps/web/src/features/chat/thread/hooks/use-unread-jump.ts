import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { UNREAD_JUMP_SETTLE_MS } from "../constants/message-row";

/**
 * Whether to offer a jump up to the "new messages" rule: only while the rule is
 * above the viewport and has not been on screen yet. Once seen, the reader knows
 * where the unread run starts, and the offer would only get in the way.
 */
export function useUnreadJump(containerRef: RefObject<HTMLElement>, unreadDividerMessageId: string | null) {
	const [isAbove, setIsAbove] = useState(false);
	const [hasSeen, setHasSeen] = useState(false);

	useEffect(() => {
		setHasSeen(false);
		setIsAbove(false);
	}, [unreadDividerMessageId]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !unreadDividerMessageId || typeof IntersectionObserver === "undefined") return;
		let observer: IntersectionObserver | null = null;
		// The thread paints at the top for a moment before it settles at the bottom or an anchor.
		// Watching from the first paint would count the rule as seen in that moment.
		const settle = window.setTimeout(() => {
			const divider = container.querySelector("[data-unread-divider]");
			if (!divider) return;
			observer = new IntersectionObserver(
				([entry]) => {
					if (!entry) return;
					if (entry.isIntersecting) {
						setHasSeen(true);
						setIsAbove(false);
					} else {
						setIsAbove(entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
					}
				},
				{ root: container },
			);
			observer.observe(divider);
		}, UNREAD_JUMP_SETTLE_MS);

		return () => {
			window.clearTimeout(settle);
			observer?.disconnect();
		};
	}, [containerRef, unreadDividerMessageId]);

	function jump(): void {
		const divider = containerRef.current?.querySelector("[data-unread-divider]");
		const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		divider?.scrollIntoView({ block: "start", behavior: isReduced ? "auto" : "smooth" });
	}

	return { isJumpOffered: isAbove && !hasSeen, jump };
}
