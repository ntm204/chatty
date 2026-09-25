import { useLayoutEffect, type RefObject } from "react";

/** Respect the CSS height ceiling and remeasure when wrapping changes on resize. */
export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement>, value: string): void {
	useLayoutEffect(() => {
		const field = ref.current;
		if (!field) return;
		function resize() {
			if (!field) return;
			field.style.height = "0px";
			field.style.height = `${field.scrollHeight}px`;
		}
		resize();
		if (typeof ResizeObserver === "undefined") return;
		let previousWidth = field.clientWidth;
		let frame: number | undefined;
		const observer = new ResizeObserver(() => {
			if (field.clientWidth === previousWidth) return;
			previousWidth = field.clientWidth;
			// Height writes during observer delivery invalidate the same layout cycle.
			// Coalesce width changes into the next frame, outside that delivery.
			if (frame === undefined) {
				frame = requestAnimationFrame(() => {
					frame = undefined;
					resize();
				});
			}
		});
		observer.observe(field);

		return () => {
			observer.disconnect();
			if (frame !== undefined) cancelAnimationFrame(frame);
		};
	}, [ref, value]);
}
