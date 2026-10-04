import { GLIDE_DISTANCE_VIEWPORTS } from "../constants/message-navigation";

export function prefersReducedMotion(): boolean {
	return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Move a far destination within one glide of the viewport before a smooth scroll.
 *
 * Native smooth scrolling crawls through every row in between, and a destination
 * in a freshly loaded window has no meaningful "in between" at all. Like the large
 * messengers, only the last stretch of the trip is animated.
 */
export function prepareGlide(container: HTMLElement, top: number, from: "current" | "above" | "below" = "current") {
	const distance = container.clientHeight * GLIDE_DISTANCE_VIEWPORTS;
	const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
	let start: number;
	if (from === "above") start = top - distance;
	else if (from === "below") start = top + distance;
	else if (Math.abs(top - container.scrollTop) > distance)
		start = top - Math.sign(top - container.scrollTop) * distance;
	else return;
	container.scrollTop = Math.max(0, Math.min(start, maxTop));
}
