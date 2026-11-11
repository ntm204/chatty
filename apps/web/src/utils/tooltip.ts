import { TOOLTIP_GAP_PX, TOOLTIP_TARGET_SELECTOR } from "@/constants/tooltip";
import type { TooltipState } from "@/types/tooltip";

/**
 * The name to show for a control, or null when it needs none: a control that
 * shows its own words, already has a native `title`, or opts out.
 */
export function getTooltipText(target: EventTarget | null): { element: HTMLElement; text: string } | null {
	if (!(target instanceof Element)) return null;
	const element = target.closest<HTMLElement>(TOOLTIP_TARGET_SELECTOR);
	if (!element || element.hasAttribute("title") || element.dataset.tooltip === "off") return null;
	const explicit = element.dataset.tooltip;
	if (explicit) return { element, text: explicit };
	if (element.textContent?.trim()) return null;
	const label = element.getAttribute("aria-label")?.trim();

	return label ? { element, text: label } : null;
}

/** Below the control, centred; above it when the window has no room underneath. */
export function placeTooltip(text: string, anchor: DOMRect, viewportHeight: number): TooltipState {
	const isAbove = anchor.bottom + TOOLTIP_GAP_PX + 32 > viewportHeight;

	return {
		text,
		left: anchor.left + anchor.width / 2,
		top: isAbove ? anchor.top - TOOLTIP_GAP_PX : anchor.bottom + TOOLTIP_GAP_PX,
		isAbove,
	};
}
