import { useLayoutEffect, type RefObject } from "react";

/** Mobile keyboards can cover the layout viewport without changing `100dvh`. */
export function useChatViewport(ref: RefObject<HTMLDivElement>): void {
	useLayoutEffect(() => {
		const shell = ref.current;
		const viewport = window.visualViewport;
		if (!shell || !viewport) return;

		function update(): void {
			if (!shell || !viewport) return;
			// Resizing the app during pinch zoom fights the reader's zoom and pan.
			if (viewport.scale !== 1) return;
			shell.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
			shell.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
		}

		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);

		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
			shell.style.removeProperty("--chat-viewport-height");
			shell.style.removeProperty("--chat-viewport-top");
		};
	}, [ref]);
}
