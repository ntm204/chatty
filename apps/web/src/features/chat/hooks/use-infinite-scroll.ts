import { useEffect, useRef } from "react";

/**
 * Calls `onReach` when a sentinel element scrolls into view.
 *
 * Extracted when the sidebar became the second pager in this feature — the
 * vault was the first, and the rule is that the same effect written twice
 * belongs somewhere both can read it. The margin fires the request slightly
 * before the sentinel is visible, so a page is usually already in flight by the
 * time the reader reaches the end of the one they are on.
 *
 * Guarded on `isLoading` as well as `hasMore`: an observer that stays connected
 * while a request is in flight fires again on every scroll event, and the second
 * call would page from the same cursor and append the same rows.
 *
 * `typeof IntersectionObserver === "undefined"` is not defensive coding — jsdom
 * does not implement it, so every component test rendering a pager would throw
 * without this line.
 */
export function useInfiniteScroll<Element extends HTMLElement>(
	hasMore: boolean,
	isLoading: boolean,
	onReach: () => void,
	rootMargin = "240px",
) {
	const sentinelRef = useRef<Element>(null);
	// Read through a ref so a caller passing an inline arrow does not tear the
	// observer down and build a new one on every render.
	const onReachRef = useRef(onReach);
	onReachRef.current = onReach;

	useEffect(() => {
		const target = sentinelRef.current;
		if (!target || !hasMore || isLoading || typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) onReachRef.current();
			},
			// The nearest scrolling ancestor is the root, not the viewport: a margin on
			// the viewport never reaches past the sidebar's or vault's own clipping, so
			// the next page only started once the reader hit the very bottom.
			{ root: findScrollParent(target), rootMargin },
		);
		observer.observe(target);

		return () => observer.disconnect();
	}, [hasMore, isLoading, rootMargin]);

	return sentinelRef;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
	for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		const { overflowY } = getComputedStyle(parent);
		if (overflowY === "auto" || overflowY === "scroll") return parent;
	}

	return null;
}
