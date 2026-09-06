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
			className={cn(
				"absolute inset-y-3 z-30 w-2 touch-none cursor-col-resize select-none rounded-full outline-none transition-colors hover:bg-ink/15 focus-visible:bg-ink/20 active:bg-ink/25",
				edge === "right" ? "-right-2" : "-left-2",
				className,
			)}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.focus();
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = { x: event.clientX, width };
			}}
			onPointerMove={(event) => {
				const drag = dragRef.current;
				if (!drag) return;
				resize(drag.width + (event.clientX - drag.x) * (edge === "right" ? 1 : -1));
			}}
			onPointerUp={(event) => {
				dragRef.current = null;
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			}}
			onLostPointerCapture={() => {
				dragRef.current = null;
			}}
			onPointerCancel={() => {
				dragRef.current = null;
			}}
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
