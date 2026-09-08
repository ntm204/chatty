import { useEffect, useRef } from "react";

/** Keep pointer animation off React's render path and release listeners on unmount. */
export function useBrandGaze() {
	const brandRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const brand = brandRef.current;
		const symbol = brand?.querySelector<HTMLElement>(".brand-symbol");
		if (!brand || !symbol || !window.matchMedia) return;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
		let frame = 0;
		let restTimer = 0;
		let pointerX = 0;
		let pointerY = 0;

		function rest() {
			window.cancelAnimationFrame(frame);
			window.clearTimeout(restTimer);
			frame = 0;
			brand!.style.removeProperty("--gaze-x");
			brand!.style.removeProperty("--gaze-y");
		}

		function follow(event: PointerEvent) {
			if (preference.matches || !pointer.matches || document.hidden || event.pointerType === "touch") return;
			pointerX = event.clientX;
			pointerY = event.clientY;
			if (frame) return;
			frame = window.requestAnimationFrame(() => {
				frame = 0;
				const bounds = symbol!.getBoundingClientRect();
				const deltaX = pointerX - bounds.left - bounds.width / 2;
				const deltaY = pointerY - bounds.top - bounds.height / 2;
				const distance = Math.max(100, Math.hypot(deltaX, deltaY));
				brand!.style.setProperty("--gaze-x", `${((deltaX / distance) * 2.4).toFixed(2)}px`);
				brand!.style.setProperty("--gaze-y", `${((deltaY / distance) * 1.6).toFixed(2)}px`);
				window.clearTimeout(restTimer);
				restTimer = window.setTimeout(rest, 1800);
			});
		}

		function leave(event: PointerEvent) {
			if (!event.relatedTarget) rest();
		}

		function visibility() {
			brand!.toggleAttribute("data-gaze-paused", document.hidden);
			if (document.hidden) rest();
		}

		visibility();
		window.addEventListener("pointermove", follow, { passive: true });
		document.addEventListener("pointerout", leave, { passive: true });
		window.addEventListener("blur", rest);
		document.addEventListener("visibilitychange", visibility);
		preference.addEventListener("change", rest);
		pointer.addEventListener("change", rest);

		return () => {
			rest();
			window.removeEventListener("pointermove", follow);
			document.removeEventListener("pointerout", leave);
			window.removeEventListener("blur", rest);
			document.removeEventListener("visibilitychange", visibility);
			preference.removeEventListener("change", rest);
			pointer.removeEventListener("change", rest);
		};
	}, []);

	return brandRef;
}
