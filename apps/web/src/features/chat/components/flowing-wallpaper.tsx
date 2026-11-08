import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/utils/cn";
import {
	CHAT_WALLPAPERS,
	WALLPAPER_CANVAS_HEIGHT,
	WALLPAPER_CANVAS_WIDTH,
	WALLPAPER_FLOW_MS,
} from "../constants/chat-wallpapers";
import type { WallpaperKey } from "../types/chat-wallpaper";
import { easeInOutCubic, paintFlowingGradient } from "../utils";

interface FlowingWallpaperProps {
	theme: WallpaperKey;
	/**
	 * Changes once per message the reader sends; each change moves the colours
	 * one step. `undefined` and the first value seen never animate, so opening
	 * a conversation does not set it flowing.
	 */
	flowKey?: string | undefined;
	/** A still thumbnail: the full gradient in either mode, no pattern, no flow. */
	isStill?: boolean;
	className?: string;
}

/**
 * The conversation's background: a four-colour gradient that flows one step
 * each time you send, under a doodle pattern — after Telegram's animated
 * backgrounds, implemented from scratch.
 *
 * By day the gradient fills the pane and the pattern sits on it softly. At night
 * the pane is near-black and the gradient shows only through the pattern's
 * lines (`.chat-wallpaper` in `conversation-themes.css`), so the doodles glow in
 * the theme's colours. Reduced motion paints each step without the travel.
 */
export function FlowingWallpaper({ theme, flowKey, isStill = false, className }: FlowingWallpaperProps) {
	const resolved = useTheme((state) => state.resolved);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stepRef = useRef(0);
	const lastFlowKeyRef = useRef(flowKey);
	const frameRef = useRef(0);
	const colours = CHAT_WALLPAPERS[theme][resolved];

	// Repaint at rest whenever the colours change.
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		const image = context.createImageData(canvas.width, canvas.height);
		paintFlowingGradient(image, colours, stepRef.current, 0);
		context.putImageData(image, 0, 0);
	}, [colours]);

	// One step of flow per message sent.
	useEffect(() => {
		if (isStill || flowKey === undefined || flowKey === lastFlowKeyRef.current) return;
		const isFirstKey = lastFlowKeyRef.current === undefined;
		lastFlowKeyRef.current = flowKey;
		if (isFirstKey) return;
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		const image = context.createImageData(canvas.width, canvas.height);
		const from = stepRef.current;
		stepRef.current = from + 1;
		// A hidden tab paints the new step at rest instead of animating nobody's screen.
		const isReduced = document.hidden || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
		if (isReduced) {
			paintFlowingGradient(image, colours, stepRef.current, 0);
			context.putImageData(image, 0, 0);

			return;
		}
		cancelAnimationFrame(frameRef.current);
		const start = performance.now();
		const tick = (now: number) => {
			// A frame's timestamp can predate `start`, so clamp at both ends.
			const progress = Math.min(1, Math.max(0, (now - start) / WALLPAPER_FLOW_MS));
			const eased = easeInOutCubic(progress);
			paintFlowingGradient(image, colours, from + eased, Math.sin(eased * Math.PI) * 1.1);
			context.putImageData(image, 0, 0);
			if (progress < 1) frameRef.current = requestAnimationFrame(tick);
		};
		frameRef.current = requestAnimationFrame(tick);
	}, [colours, flowKey, isStill]);

	useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

	return (
		<span aria-hidden="true" className={cn("chat-wallpaper", isStill && "chat-wallpaper-still", className)}>
			<canvas
				ref={canvasRef}
				width={WALLPAPER_CANVAS_WIDTH}
				height={WALLPAPER_CANVAS_HEIGHT}
				className="chat-wallpaper-gradient"
			/>
			{!isStill && <span className="chat-wallpaper-pattern" />}
		</span>
	);
}
