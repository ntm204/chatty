import {
	GLIDE_SETTLE_MAX_MS,
	GLIDE_SETTLE_POLL_MS,
	GLIDE_SETTLE_STILL_POLLS,
	MESSAGE_LOCATION_DURATION_MS,
	MESSAGE_NAVIGATION_EVENT,
} from "../constants/message-navigation";
import { prefersReducedMotion, prepareGlide } from "./glide-scroll";
import { getMessageViewportTop } from "./message-viewport";

interface MessageLocation {
	element: HTMLElement;
	timer: number;
}

const messageLocations = new WeakMap<HTMLElement, MessageLocation>();
const glideSettles = new WeakMap<HTMLElement, () => void>();
const READER_INPUTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

function cancelGlideSettle(container: HTMLElement) {
	glideSettles.get(container)?.();
	glideSettles.delete(container);
}

export function clearMessageLocation(container: HTMLElement) {
	cancelGlideSettle(container);
	const previous = messageLocations.get(container);
	if (!previous) return;

	window.clearTimeout(previous.timer);
	previous.element.removeAttribute("data-message-located");
	messageLocations.delete(container);
}

function measureDestination(container: HTMLElement, element: HTMLElement): number {
	const bounds = element.getBoundingClientRect();
	const visibleTop = getMessageViewportTop(container);
	const visibleHeight = Math.max(0, container.getBoundingClientRect().bottom - visibleTop);
	const top = container.scrollTop + bounds.top - visibleTop - Math.max(8, (visibleHeight - bounds.height) / 2);

	return Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
}

/**
 * Lands a glide that something else cut short.
 *
 * Any scrollTop write cancels a native smooth scroll — anchor corrections when
 * late media resizes a freshly loaded window do exactly that — and a glide that
 * starts a viewport away would then stop with its target off screen. Once the
 * motion settles, an uninterrupted trip finishes instantly; one the reader took
 * over with wheel, touch, pointer or keys is left where they put it.
 */
function settleGlide(container: HTMLElement, element: HTMLElement) {
	let isInterrupted = false;
	let previousTop = container.scrollTop;
	let stillPolls = 0;
	let elapsed = 0;
	const interrupt = () => {
		isInterrupted = true;
	};
	for (const input of READER_INPUTS) container.addEventListener(input, interrupt, { passive: true });
	const timer = window.setInterval(() => {
		elapsed += GLIDE_SETTLE_POLL_MS;
		stillPolls = Math.abs(container.scrollTop - previousTop) < 0.5 ? stillPolls + 1 : 0;
		previousTop = container.scrollTop;
		if (stillPolls < GLIDE_SETTLE_STILL_POLLS && elapsed < GLIDE_SETTLE_MAX_MS) return;
		cancelGlideSettle(container);
		if (isInterrupted || !element.isConnected) return;
		const destination = measureDestination(container, element);
		if (Math.abs(container.scrollTop - destination) > 2) container.scrollTo({ top: destination, behavior: "auto" });
	}, GLIDE_SETTLE_POLL_MS);
	glideSettles.set(container, () => {
		window.clearInterval(timer);
		for (const input of READER_INPUTS) container.removeEventListener(input, interrupt);
	});
}

/** Scroll only the history viewport; scrolling ancestors can displace the entire app shell. */
export function scrollToMessage(messageId: string, behavior: ScrollBehavior = "smooth"): boolean {
	const element = document.getElementById(`message-${messageId}`);
	if (!element) return false;

	const container = element.closest<HTMLElement>('[aria-label="Message history"]');
	if (!container || container.clientHeight === 0) return false;
	const destination = measureDestination(container, element);
	const resolvedBehavior = prefersReducedMotion() ? "auto" : behavior;
	// Announced before moving, so a reader following the live edge is released
	// and an arrival during the trip does not pull them back to the bottom.
	container.dispatchEvent(new Event(MESSAGE_NAVIGATION_EVENT));
	// One cue for replies, pins and search, with a renewed lifetime on repeat jumps.
	clearMessageLocation(container);
	if (resolvedBehavior === "smooth") prepareGlide(container, destination);
	container.scrollTo({ top: destination, behavior: resolvedBehavior });
	if (resolvedBehavior === "smooth") settleGlide(container, element);
	element.setAttribute("data-message-located", "true");
	const timer = window.setTimeout(() => clearMessageLocation(container), MESSAGE_LOCATION_DURATION_MS);
	messageLocations.set(container, { element, timer });

	return true;
}
