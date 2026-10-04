import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

interface PanelResizeHandleProps {
	panelId: string;
	label: string;
	edge: "left" | "right";
	defaultWidth: number;
	minWidth: number;
	maxWidth: number;
	className?: string;
}

/** Pointer capture keeps resizing reliable even when the cursor leaves the narrow divider. */
export function PanelResizeHandle({
	panelId,
	label,
	edge,
	defaultWidth,
	minWidth,
	maxWidth,
	className,
}: PanelResizeHandleProps) {
	const handleRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ x: number; width: number } | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [width, setWidth] = useState(() => {
		try {
			const saved = Number(localStorage.getItem(`chatty:panel-width:${panelId}`));

			return Number.isFinite(saved) && saved >= minWidth && saved <= maxWidth ? saved : defaultWidth;
		} catch {
			return defaultWidth;
		}
	});

	useEffect(() => {
		handleRef.current?.parentElement?.style.setProperty("--panel-width", `${width}px`);
		try {
			localStorage.setItem(`chatty:panel-width:${panelId}`, String(width));
		} catch {
			// Storage is optional; resizing still works in this session.
		}
	}, [panelId, width]);

	function endDrag() {
		dragRef.current = null;
		setIsDragging(false);
	}

	function resize(nextWidth: number) {
		setWidth(Math.min(maxWidth, Math.max(minWidth, Math.round(nextWidth))));
	}

	return (
		<div
			ref={handleRef}
			role="separator"
			tabIndex={0}
			aria-label={label}
			aria-controls={panelId}
			aria-orientation="vertical"
			aria-valuemin={minWidth}
			aria-valuemax={maxWidth}
			aria-valuenow={width}
			aria-valuetext={`${width} pixels`}
			title="Drag to resize · Double-click to reset"
			data-dragging={isDragging || undefined}
			className={cn(
				// The hit area fills the whole gutter between the panels; the visible
				// line inside it is drawn by `.panel-resize-handle` and stays hidden at rest.
				"panel-resize-handle absolute inset-y-0 z-30 w-3 touch-none cursor-col-resize select-none outline-none",
				edge === "right" ? "-right-3" : "-left-3",
				className,
			)}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.focus();
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = { x: event.clientX, width };
				setIsDragging(true);
			}}
			onPointerMove={(event) => {
				const drag = dragRef.current;
				if (!drag) return;
				resize(drag.width + (event.clientX - drag.x) * (edge === "right" ? 1 : -1));
			}}
			onPointerUp={(event) => {
				endDrag();
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			}}
			onLostPointerCapture={endDrag}
			onPointerCancel={endDrag}
			onDoubleClick={() => resize(defaultWidth)}
			onKeyDown={(event) => {
				if (event.key === "Home") resize(minWidth);
				else if (event.key === "End") resize(maxWidth);
				else if (event.key === "Enter") resize(defaultWidth);
				else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					const direction = event.key === "ArrowRight" ? 1 : -1;
					resize(width + direction * (edge === "right" ? 1 : -1) * (event.shiftKey ? 40 : 16));
				} else return;
				event.preventDefault();
			}}
		/>
	);
}
