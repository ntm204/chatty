import { useLayoutEffect, useRef } from "react";

export function useCompactMessage(content: string, isEnabled: boolean) {
	const bubbleRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const element = bubbleRef.current;
		if (!element) return;
		const bubble: HTMLDivElement = element;
		const initialWidth = bubble.style.width;
		bubble.style.width = "auto";
		const paragraph = bubble.querySelector<HTMLParagraphElement>(":scope > p");
		if (!isEnabled || !paragraph) {
			return () => {
				bubble.style.width = initialWidth;
			};
		}
		const textElement: HTMLParagraphElement = paragraph;
		const range = document.createRange();
		// jsdom has no text layout; the CSS width remains the fallback there.
		if (typeof range.getClientRects !== "function") return;
		let isDisposed = false;
		const container = bubble.closest("[data-message-interaction-row]")?.parentElement;
		let observedWidth = container?.getBoundingClientRect().width;

		function readTextRects(): DOMRect[] {
			const rectangles: DOMRect[] = [];
			const walker = document.createTreeWalker(textElement, NodeFilter.SHOW_TEXT);
			let textNode = walker.nextNode();
			while (textNode) {
				range.selectNodeContents(textNode);
				for (const rectangle of range.getClientRects()) {
					if (
						rectangle.width > 0 &&
						rectangle.height > 0 &&
						[rectangle.left, rectangle.right, rectangle.top, rectangle.bottom].every(Number.isFinite)
					) {
						rectangles.push(rectangle);
					}
				}
				textNode = walker.nextNode();
			}

			return rectangles;
		}

		function compactBubble(): void {
			if (isDisposed || !bubble.isConnected) return;
			// Recover the real cap and flex gutter before measuring, including after a wider resize.
			bubble.style.width = "auto";
			const originalBounds = bubble.getBoundingClientRect();
			if (
				!bubble.getClientRects().length ||
				!Number.isFinite(originalBounds.width) ||
				originalBounds.width <= 0 ||
				originalBounds.height <= 0
			) {
				return;
			}
			const originalTextHeight = textElement.getBoundingClientRect().height;
			const rectangles = readTextRects();
			const firstRectangle = rectangles[0];
			if (!firstRectangle) return;
			// Different fallback fonts can have different tops on the same visual line.
			const hasMultipleLines = rectangles.some(
				(rectangle) => rectangle.top >= firstRectangle.bottom - 1 || rectangle.bottom <= firstRectangle.top + 1,
			);
			if (!hasMultipleLines) return;

			const styles = getComputedStyle(bubble);
			const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
			const horizontalBorder =
				Number.parseFloat(styles.borderLeftWidth) + Number.parseFloat(styles.borderRightWidth);
			const horizontalInsets = horizontalPadding + horizontalBorder;
			const left = Math.min(...rectangles.map((rectangle) => rectangle.left));
			const right = Math.max(...rectangles.map((rectangle) => rectangle.right));
			// One pixel prevents fractional glyph widths from introducing a new line after rounding.
			const compactWidth = Math.ceil(right - left + horizontalInsets) + 1;
			if (!Number.isFinite(compactWidth) || compactWidth <= 0 || compactWidth >= originalBounds.width - 1) return;
			bubble.style.width = `${styles.boxSizing === "border-box" ? compactWidth : compactWidth - horizontalInsets}px`;

			const fittedTextBounds = textElement.getBoundingClientRect();
			const hasExtraHeight =
				fittedTextBounds.height > originalTextHeight + 1 ||
				bubble.getBoundingClientRect().height > originalBounds.height + 1;
			const hasOverflow =
				textElement.scrollWidth > textElement.clientWidth + 1 ||
				bubble.scrollWidth > bubble.clientWidth + 1 ||
				readTextRects().some(
					(rectangle) =>
						rectangle.left < fittedTextBounds.left - 1 || rectangle.right > fittedTextBounds.right + 1,
				);
			if (hasExtraHeight || hasOverflow) bubble.style.width = "auto";
		}

		compactBubble();
		// The full-width outer message is independent of the fitted bubble and shrinking interaction row.
		const observer =
			container && typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						const nextWidth = container.getBoundingClientRect().width;
						if (nextWidth === observedWidth) return;
						observedWidth = nextWidth;
						compactBubble();
					})
				: null;
		if (container) observer?.observe(container);
		const fonts = document.fonts;
		fonts?.addEventListener("loadingdone", compactBubble);
		if (fonts?.status === "loading") void fonts.ready.then(compactBubble);

		return () => {
			isDisposed = true;
			observer?.disconnect();
			fonts?.removeEventListener("loadingdone", compactBubble);
			bubble.style.width = initialWidth;
		};
	}, [content, isEnabled]);

	return bubbleRef;
}
