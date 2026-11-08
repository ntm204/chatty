import { useEffect, useState } from "react";

/**
 * How far to shrink a fixed-size drawing so it fits its container's width,
 * never enlarging it, kept current as the container resizes.
 *
 * Returns a callback ref rather than a ref object: the container can mount
 * after the hook does (the preview opens on the phone and switches to the
 * desktop later), and an effect keyed on a ref object would never notice.
 */
export function useFitScale<Element extends HTMLElement>(designWidth: number) {
	const [container, setContainer] = useState<Element | null>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		if (!container || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setScale(Math.min(1, entry.contentRect.width / designWidth));
		});
		observer.observe(container);

		return () => observer.disconnect();
	}, [container, designWidth]);

	return { containerRef: setContainer, scale };
}
