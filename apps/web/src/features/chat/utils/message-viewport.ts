/** The floating header is inside the scroll viewport but hides the rows behind it. */
export function getMessageViewportTop(container: HTMLElement): number {
	const viewport = container.getBoundingClientRect();
	const chrome = container.closest(".conversation-pane")?.querySelector(".conversation-chrome");

	return Math.min(viewport.bottom, Math.max(viewport.top, chrome?.getBoundingClientRect().bottom ?? viewport.top));
}
