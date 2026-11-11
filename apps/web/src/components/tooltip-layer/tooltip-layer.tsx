import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOOLTIP_DELAY_MS, TOOLTIP_EDGE_PX, TOOLTIP_WARM_MS } from "@/constants/tooltip";
import type { TooltipState } from "@/types/tooltip";
import { clamp } from "@/utils/clamp";
import { getTooltipText, placeTooltip } from "@/utils/tooltip";

/**
 * One tooltip for the whole app: every icon-only control shows its accessible
 * name on mouse hover or keyboard focus, so no button needs its own wrapper and
 * none can be forgotten. Touch never shows one — a press would act first.
 * Hidden from assistive technology, which already reads the `aria-label`.
 */
export function TooltipLayer() {
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const bubbleRef = useRef<HTMLDivElement>(null);
	const [shiftX, setShiftX] = useState(0);

	useEffect(() => {
		let timer = 0;
		let current: HTMLElement | null = null;
		let lastHiddenAt = 0;

		function hide() {
			window.clearTimeout(timer);
			if (current) lastHiddenAt = Date.now();
			current = null;
			setTooltip(null);
		}
		function show(target: EventTarget | null) {
			const found = getTooltipText(target);
			if (!found) return;
			if (found.element === current) return;
			hide();
			current = found.element;
			const reveal = () => {
				if (current !== found.element || !found.element.isConnected) return;
				setTooltip(placeTooltip(found.text, found.element.getBoundingClientRect(), window.innerHeight));
			};
			if (Date.now() - lastHiddenAt < TOOLTIP_WARM_MS) reveal();
			else timer = window.setTimeout(reveal, TOOLTIP_DELAY_MS);
		}
		function onPointerOver(event: PointerEvent) {
			if (event.pointerType === "touch") return;
			show(event.target);
		}
		function onPointerOut(event: PointerEvent) {
			if (current && !current.contains(event.relatedTarget as Node | null)) hide();
		}
		function onFocusIn(event: FocusEvent) {
			// Keyboard focus only: a mouse click also focuses, and hover already covers it.
			if (event.target instanceof Element && event.target.matches(":focus-visible")) show(event.target);
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") hide();
		}
		document.addEventListener("pointerover", onPointerOver);
		document.addEventListener("pointerout", onPointerOut);
		document.addEventListener("pointerdown", hide, true);
		document.addEventListener("focusin", onFocusIn);
		document.addEventListener("focusout", hide);
		document.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("scroll", hide, true);
		window.addEventListener("resize", hide);

		return () => {
			window.clearTimeout(timer);
			document.removeEventListener("pointerover", onPointerOver);
			document.removeEventListener("pointerout", onPointerOut);
			document.removeEventListener("pointerdown", hide, true);
			document.removeEventListener("focusin", onFocusIn);
			document.removeEventListener("focusout", hide);
			document.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("resize", hide);
		};
	}, []);

	// Keep the bubble inside the window: measured after render, then nudged sideways.
	useLayoutEffect(() => {
		if (!tooltip || !bubbleRef.current) return;
		const halfWidth = bubbleRef.current.offsetWidth / 2;
		const left = clamp(tooltip.left, TOOLTIP_EDGE_PX + halfWidth, window.innerWidth - TOOLTIP_EDGE_PX - halfWidth);
		setShiftX(left - tooltip.left);
	}, [tooltip]);

	if (!tooltip) return null;

	return createPortal(
		<div
			ref={bubbleRef}
			aria-hidden="true"
			className="tooltip-bubble pointer-events-none fixed z-[100] max-w-64 rounded-md bg-ink px-2 py-1 text-xs font-medium text-paper shadow-lift"
			data-above={tooltip.isAbove}
			style={{
				left: tooltip.left + shiftX,
				top: tooltip.top,
				transform: `translate(-50%, ${tooltip.isAbove ? "-100%" : "0"})`,
			}}
		>
			{tooltip.text}
		</div>,
		document.body,
	);
}
