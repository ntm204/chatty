import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from "../constants/conversation-list";

/**
 * Calls `onLongPress` when a finger holds an element without moving, the
 * touch gesture for "show me this without opening it". Mouse and pen are left
 * alone: on a desktop the same thing is an explicit button.
 *
 * `shouldSuppressClick` answers whether the click that follows the finger
 * lifting belongs to a long press, so the element's own tap action (opening the
 * chat) does not also run.
 */
export function useLongPress(onLongPress: (element: HTMLElement) => void) {
	const timerRef = useRef(0);
	const startRef = useRef<{ x: number; y: number } | null>(null);
	const didFireRef = useRef(false);

	const cancel = useCallback(() => {
		window.clearTimeout(timerRef.current);
		startRef.current = null;
	}, []);
	useEffect(() => cancel, [cancel]);

	const handlers = {
		onPointerDown(event: PointerEvent<HTMLElement>) {
			didFireRef.current = false;
			if (event.pointerType !== "touch") return;
			const element = event.currentTarget;
			startRef.current = { x: event.clientX, y: event.clientY };
			timerRef.current = window.setTimeout(() => {
				didFireRef.current = true;
				startRef.current = null;
				navigator.vibrate?.(8);
				onLongPress(element);
			}, LONG_PRESS_MS);
		},
		onPointerMove(event: PointerEvent<HTMLElement>) {
			const start = startRef.current;
			if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX) cancel();
		},
		onPointerUp: cancel,
		onPointerCancel: cancel,
		// The browser's own long-press menu would cover ours.
		onContextMenu(event: MouseEvent<HTMLElement>) {
			if (didFireRef.current || startRef.current) event.preventDefault();
		},
	};

	const shouldSuppressClick = useCallback(() => {
		const didFire = didFireRef.current;
		didFireRef.current = false;

		return didFire;
	}, []);

	return { handlers, shouldSuppressClick };
}
