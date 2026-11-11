import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { clamp } from "@/utils/clamp";
import {
	LIGHTBOX_DOUBLE_CLICK_ZOOM,
	LIGHTBOX_WHEEL_ZOOM_STEP,
	LIGHTBOX_ZOOM_MAX,
	LIGHTBOX_ZOOM_MIN,
	LIGHTBOX_ZOOM_STEP,
} from "../../constants/attachment";

interface Offset {
	x: number;
	y: number;
}

function normalizeRotation(rotation: number): number {
	return ((rotation % 360) + 360) % 360;
}

function isQuarterTurn(rotation: number): boolean {
	const normalizedRotation = normalizeRotation(rotation);

	return normalizedRotation === 90 || normalizedRotation === 270;
}

interface UseAttachmentZoomResult {
	imageAreaRef: RefObject<HTMLDivElement>;
	imageRef: RefObject<HTMLImageElement>;
	zoom: number;
	rotation: number;
	/** The scale that keeps a turned image's whole form inside the viewport. */
	fitScale: number;
	pan: Offset;
	isDragging: boolean;
	zoomIn: () => void;
	zoomOut: () => void;
	resetZoom: () => void;
	rotate: (direction?: 1 | -1) => void;
	handleImageLoad: () => void;
	handleDoubleClick: (event: MouseEvent<HTMLImageElement>) => void;
	handlePointerDown: (event: PointerEvent<HTMLImageElement>) => void;
	handlePointerMove: (event: PointerEvent<HTMLImageElement>) => void;
	handlePointerUp: (event: PointerEvent<HTMLImageElement>) => void;
}

/**
 * Pinch-to-detail for one opened picture: zoom, rotate, and drag to pan once
 * zoomed. Pulled out of the viewer component because it is a small state
 * machine with two refs and three gestures feeding it — exactly the "state
 * plus lifecycle" split this project's hooks exist for.
 *
 * **Every zoom is anchored at the point the reader is looking at.** A wheel
 * tick, a double-click and the toolbar's own buttons all zoom by moving the
 * pan so the pixel under the cursor (or the image's centre, for a button with
 * no cursor of its own) stays exactly where it was. Without that, a reader who
 * scrolls in on a face in the corner of a photograph watches it slide toward
 * the middle of the screen instead of growing under their pointer — which is
 * what makes a naive `transform: scale()` zoom feel like it is fighting you.
 *
 * `resetKey` is the attachment's own id: passing it back in ties the reset to
 * *which picture this is*, not to whatever index it happens to sit at, and
 * arriving here from a re-ordered set still resets correctly.
 */
export function useAttachmentZoom(resetKey: string): UseAttachmentZoomResult {
	const imageAreaRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const dragOrigin = useRef<Offset | null>(null);

	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [fitScale, setFitScale] = useState(1);
	const [pan, setPan] = useState<Offset>({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		setZoom(1);
		setRotation(0);
		setFitScale(1);
		setPan({ x: 0, y: 0 });
	}, [resetKey]);

	const getRotationFitScale = useCallback((nextRotation: number): number => {
		const image = imageRef.current;
		const container = imageAreaRef.current;
		if (!image || !container || image.offsetWidth === 0 || image.offsetHeight === 0) return 1;

		const containerRect = container.getBoundingClientRect();
		const rotatedWidth = isQuarterTurn(nextRotation) ? image.offsetHeight : image.offsetWidth;
		const rotatedHeight = isQuarterTurn(nextRotation) ? image.offsetWidth : image.offsetHeight;

		// At rest an image always fits. A quarter turn swaps its bounding box,
		// though, and a wide landscape would otherwise grow taller than the
		// viewport and lose its edges. This reduced base scale is distinct from
		// reader-controlled zoom: 100% still means "the whole turned image fits".
		return Math.min(1, containerRect.width / rotatedWidth, containerRect.height / rotatedHeight);
	}, []);

	const clampPan = useCallback(
		(nextPan: Offset, nextZoom: number, currentRotation: number): Offset => {
			const image = imageRef.current;
			const container = imageAreaRef.current;
			if (!image || !container) return nextPan;

			// A 90° or 270° turn swaps which of the image's own dimensions faces the
			// container's width, so the pan limit has to swap with it — otherwise a
			// sideways photograph could be dragged its long edge past the screen.
			const isSideways = isQuarterTurn(currentRotation);
			const renderedWidth = isSideways ? image.offsetHeight : image.offsetWidth;
			const renderedHeight = isSideways ? image.offsetWidth : image.offsetHeight;
			const containerRect = container.getBoundingClientRect();
			const renderedScale = nextZoom * fitScale;

			const maxX = Math.max(0, (renderedWidth * renderedScale - containerRect.width) / 2);
			const maxY = Math.max(0, (renderedHeight * renderedScale - containerRect.height) / 2);

			return { x: clamp(nextPan.x, -maxX, maxX), y: clamp(nextPan.y, -maxY, maxY) };
		},
		[fitScale],
	);

	const handleImageLoad = useCallback(
		() => setFitScale(getRotationFitScale(rotation)),
		[getRotationFitScale, rotation],
	);

	useEffect(() => {
		const container = imageAreaRef.current;
		if (!container || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(() => setFitScale(getRotationFitScale(rotation)));
		observer.observe(container);

		return () => observer.disconnect();
	}, [getRotationFitScale, rotation]);

	const zoomAtPoint = useCallback(
		(targetZoom: number, clientX: number, clientY: number) => {
			const container = imageAreaRef.current;
			const nextZoom = clamp(targetZoom, LIGHTBOX_ZOOM_MIN, LIGHTBOX_ZOOM_MAX);

			if (!container || nextZoom === zoom) {
				setZoom(nextZoom);

				return;
			}

			// The point under the cursor, expressed as an offset from the image's
			// own screen centre at the *current* zoom — see the derivation in the
			// hook's own doc comment for why this is what has to stay fixed.
			const rect = container.getBoundingClientRect();
			const offsetX = clientX - (rect.left + rect.width / 2) - pan.x;
			const offsetY = clientY - (rect.top + rect.height / 2) - pan.y;
			const scaleRatio = 1 - nextZoom / zoom;

			setPan(clampPan({ x: pan.x + offsetX * scaleRatio, y: pan.y + offsetY * scaleRatio }, nextZoom, rotation));
			setZoom(nextZoom);
		},
		[clampPan, pan, rotation, zoom],
	);

	// Re-registered on every change to the three values it reads, so the
	// listener always zooms around the current point rather than one captured
	// when the viewer first opened. Native rather than `onWheel`: React attaches
	// wheel listeners as passive, and a passive listener cannot call
	// `preventDefault`, which is what stops the gesture also scrolling the page
	// behind the fixed viewer.
	useEffect(() => {
		const node = imageAreaRef.current;
		if (!node) return;

		function handleWheel(event: WheelEvent) {
			event.preventDefault();
			const step = event.deltaY > 0 ? -LIGHTBOX_WHEEL_ZOOM_STEP : LIGHTBOX_WHEEL_ZOOM_STEP;
			zoomAtPoint(zoom + step, event.clientX, event.clientY);
		}

		node.addEventListener("wheel", handleWheel, { passive: false });

		return () => node.removeEventListener("wheel", handleWheel);
	}, [zoom, zoomAtPoint]);

	const zoomIn = useCallback(() => {
		const rect = imageAreaRef.current?.getBoundingClientRect();
		if (!rect) return;
		zoomAtPoint(zoom + LIGHTBOX_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
	}, [zoom, zoomAtPoint]);

	const zoomOut = useCallback(() => {
		const rect = imageAreaRef.current?.getBoundingClientRect();
		if (!rect) return;
		zoomAtPoint(zoom - LIGHTBOX_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
	}, [zoom, zoomAtPoint]);

	const resetZoom = useCallback(() => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
	}, []);

	const rotate = useCallback(
		(direction: 1 | -1 = 1) => {
			const nextRotation = normalizeRotation(rotation + direction * 90);

			setRotation(nextRotation);
			setFitScale(getRotationFitScale(nextRotation));
			setPan({ x: 0, y: 0 });
		},
		[getRotationFitScale, rotation],
	);

	const handleDoubleClick = useCallback(
		(event: MouseEvent<HTMLImageElement>) => {
			event.stopPropagation();
			if (zoom > 1) {
				resetZoom();
			} else {
				zoomAtPoint(LIGHTBOX_DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
			}
		},
		[resetZoom, zoom, zoomAtPoint],
	);

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLImageElement>) => {
			if (zoom <= 1) return;
			event.stopPropagation();
			// Optional: jsdom has no `setPointerCapture` at all, and a browser that
			// somehow lacks it should still let the drag work off plain bubbling
			// rather than throw and abandon the gesture.
			event.currentTarget.setPointerCapture?.(event.pointerId);
			dragOrigin.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
			setIsDragging(true);
		},
		[pan, zoom],
	);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLImageElement>) => {
			if (!dragOrigin.current) return;
			const nextPan = { x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y };
			setPan(clampPan(nextPan, zoom, rotation));
		},
		[clampPan, rotation, zoom],
	);

	const handlePointerUp = useCallback((event: PointerEvent<HTMLImageElement>) => {
		if (!dragOrigin.current) return;
		dragOrigin.current = null;
		setIsDragging(false);
		event.currentTarget.releasePointerCapture?.(event.pointerId);
	}, []);

	return {
		imageAreaRef,
		imageRef,
		zoom,
		rotation,
		fitScale,
		pan,
		isDragging,
		zoomIn,
		zoomOut,
		resetZoom,
		rotate,
		handleImageLoad,
		handleDoubleClick,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
	};
}
