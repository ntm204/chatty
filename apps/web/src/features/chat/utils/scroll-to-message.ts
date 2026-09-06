/** Scroll only the history viewport; scrolling ancestors can displace the entire app shell. */
export function scrollToMessage(messageId: string, behavior: ScrollBehavior = "smooth"): boolean {
	const element = document.getElementById(`message-${messageId}`);
	if (!element) return false;

	const container = element.closest<HTMLElement>('[aria-label="Message history"]');
	if (!container || container.clientHeight === 0) return false;
	const bounds = element.getBoundingClientRect();
	const viewport = container.getBoundingClientRect();
	const top = container.scrollTop + bounds.top - viewport.top - (container.clientHeight - bounds.height) / 2;
	container.scrollTo({ top: Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight)), behavior });
	if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
		element.animate?.([{ backgroundColor: "var(--color-signal-soft)" }, { backgroundColor: "transparent" }], {
			duration: 1600,
		});
	}

	return true;
}
