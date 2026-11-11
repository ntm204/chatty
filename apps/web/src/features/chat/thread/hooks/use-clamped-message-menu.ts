import { useLayoutEffect, type RefObject } from "react";
import { getMessageViewportTop } from "../../utils/message-viewport";

/**
 * Keep inline action menus inside the visible part of the history: below the
 * floating header and pins (which cover the top of the scroll viewport) and
 * above the composer. A menu with no room above its trigger flips below it
 * rather than sliding down over the message it belongs to.
 */
export function useClampedMessageMenu(rootRef: RefObject<HTMLElement>, openPanel: string | null, contentKey: boolean) {
	useLayoutEffect(() => {
		if (!openPanel) return;
		const root = rootRef.current;
		if (!root) return;
		let menu: HTMLElement | null = null;
		const history = root.closest<HTMLElement>('[aria-label="Message history"]');
		let horizontal = 0;
		let vertical = 0;
		const position = () => {
			const visibleMenu = root.querySelector<HTMLElement>('[role="menu"], [role="dialog"]');
			if (!visibleMenu) return;
			if (visibleMenu !== menu) {
				if (menu) observer?.unobserve(menu);
				menu = visibleMenu;
				horizontal = 0;
				vertical = 0;
				observer?.observe(menu);
			}
			const bounds = history?.getBoundingClientRect();
			const top = Math.max(8, (history ? getMessageViewportTop(history) : 0) + 8);
			const bottom = Math.min(window.innerHeight - 8, (bounds?.bottom ?? window.innerHeight) - 8);
			menu.style.maxHeight = `${Math.max(48, bottom - top)}px`;
			menu.style.maxWidth = `${Math.max(0, window.innerWidth - 16)}px`;
			menu.style.overflowY = "auto";
			const rect = menu.getBoundingClientRect();
			const left = rect.left - horizontal;
			const baselineTop = rect.top - vertical;
			horizontal = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)) - left;
			// Opened upward by default; when that would pass under the header, open downward instead.
			const below = root.getBoundingClientRect().bottom + 8;
			const preferredTop = baselineTop < top && below + rect.height <= bottom ? below : baselineTop;
			vertical = Math.max(top, Math.min(preferredTop, bottom - rect.height)) - baselineTop;
			menu.style.translate = `${horizontal}px ${vertical}px`;
		};
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
		position();
		const contentObserver = new MutationObserver(position);
		contentObserver.observe(root, { childList: true, subtree: true });
		window.addEventListener("resize", position);
		history?.addEventListener("scroll", position);

		return () => {
			observer?.disconnect();
			contentObserver.disconnect();
			window.removeEventListener("resize", position);
			history?.removeEventListener("scroll", position);
			if (menu) menu.style.translate = "";
		};
	}, [rootRef, openPanel, contentKey]);
}
