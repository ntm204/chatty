import type { PointerEvent } from "react";
import { useRef, useState } from "react";
import { DOUBLE_TAP_MS, SWIPE_REPLY_MAX_PX, SWIPE_REPLY_THRESHOLD_PX } from "../constants/message-row";

interface MessageGestureOptions {
	/** Absent when the message cannot be answered (a tombstone, still sending). */
	onReply?: (() => void) | undefined;
	/** Absent when it cannot be reacted to. */
	onDoubleTap?: (() => void) | undefined;
}

function isInteractive(target: EventTarget | null): boolean {
	return Boolean((target as HTMLElement | null)?.closest("a, button, input, textarea, [role='button']"));
}

/**
 * The touch gestures every messenger shares, on a message row:
 *
 * - drag the bubble left and let go past `SWIPE_REPLY_THRESHOLD_PX` to reply;
 *   the bubble follows the finger and a reply arrow grows behind it;
 * - double-tap to leave a heart;
 * - a plain tap focuses the row, which reveals its action buttons (a phone has
 *   no hover).
 *
 * Mouse input is left alone: desktop has the action buttons on hover.
 * Vertical movement is the list's — `touch-action: pan-y` on the row — so a
 * scroll never turns into a swipe.
 */
export function useMessageGestures({ onReply, onDoubleTap }: MessageGestureOptions) {
	const [offset, setOffset] = useState(0);
	const startRef = useRef<{ x: number; y: number; id: number } | null>(null);
	const lastTapRef = useRef(0);

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "mouse" || isInteractive(event.target)) return;
		startRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
	}

	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		const start = startRef.current;
		if (!start || !onReply || start.id !== event.pointerId) return;
		const dx = start.x - event.clientX;
		const dy = Math.abs(event.clientY - start.y);
		// A mostly vertical move is a scroll, and gives up the swipe for good.
		if (dy > 12 && dy > Math.abs(dx)) {
			startRef.current = null;
			setOffset(0);

			return;
		}
		setOffset(Math.max(0, Math.min(SWIPE_REPLY_MAX_PX, dx)));
	}

	function onPointerUp(event: PointerEvent<HTMLDivElement>) {
		const start = startRef.current;
		startRef.current = null;
		if (!start) return;
		const wasSwipe = offset > 8;
		if (offset >= SWIPE_REPLY_THRESHOLD_PX) {
			navigator.vibrate?.(8);
			onReply?.();
		}
		setOffset(0);
		if (wasSwipe || window.getSelection()?.toString()) return;

		const now = performance.now();
		if (onDoubleTap && now - lastTapRef.current < DOUBLE_TAP_MS) {
			lastTapRef.current = 0;
			onDoubleTap();

			return;
		}
		lastTapRef.current = now;
		// A phone has no hover: a plain tap focuses the row to reveal its actions.
		if (event.currentTarget.contains(event.target as Node)) event.currentTarget.focus({ preventScroll: true });
	}

	function onPointerCancel() {
		startRef.current = null;
		setOffset(0);
	}

	return {
		handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
		/** How far the bubble is dragged, 0 to 1 of the threshold, for the arrow behind it. */
		progress: Math.min(1, offset / SWIPE_REPLY_THRESHOLD_PX),
		offset,
	};
}
