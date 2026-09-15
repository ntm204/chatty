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
		const observer = new ResizeObserver(() => {
			if (field.clientWidth === previousWidth) return;
			previousWidth = field.clientWidth;
			resize();
		});
		observer.observe(field);

		return () => observer.disconnect();
	}, [ref, value]);
}
