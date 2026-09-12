import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { VOICE_WAVEFORM_BARS } from "../constants/voice-waveform";
import { getVoiceWaveform } from "../utils/voice-waveform";

interface VoiceWaveformProps {
	waveform: number[];
	barCount?: number;
	progress?: number;
	className?: string;
	playedClassName?: string;
	unplayedClassName?: string;
}

/** Fixed-width bars on whole CSS pixels; only amplitude and playback color vary. */
export function VoiceWaveform({
	waveform,
	barCount = VOICE_WAVEFORM_BARS,
	progress = 0,
	className,
	playedClassName,
	unplayedClassName,
}: VoiceWaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [geometry, setGeometry] = useState({ width: 0, left: 0, ratio: 1 });
	const { width, left, ratio } = geometry;
	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const measure = () => {
			const rect = element.getBoundingClientRect();
			const next = { width: rect.width, left: rect.left, ratio: window.devicePixelRatio || 1 };
			setGeometry((current) =>
				current.width === next.width && current.left === next.left && current.ratio === next.ratio
					? current
					: next,
			);
		};
		measure();
		window.addEventListener("resize", measure);
		if (typeof ResizeObserver === "undefined") {
			return () => window.removeEventListener("resize", measure);
		}
		const observer = new ResizeObserver(measure);
		observer.observe(element);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, []);
	// Preserve at least two pixels of air rather than squeezing bars on narrow screens.
	const count = Math.min(barCount, Math.max(1, Math.floor((width + 2) / 4)));
	const bars = useMemo(() => getVoiceWaveform(waveform, count), [waveform, count]);
	const playedPercent = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) * 100 : 0;
	const barPixels = Math.max(1, Math.round(2 * ratio));
	const startPixel = Math.ceil(left * ratio);
	const availablePixels = Math.max(0, Math.floor((left + width) * ratio) - startPixel);
	const step = count > 1 ? Math.floor((availablePixels - barPixels) / (count - 1)) : 0;
	const offset = Math.max(0, Math.floor((availablePixels - (step * (count - 1) + barPixels)) / 2));
	const renderBars = () =>
		bars.map((height, index) => (
			<span
				key={index}
				className="absolute top-1/2 -translate-y-1/2 rounded-full bg-current"
				style={{
					left: (startPixel + offset + index * step) / ratio - left,
					width: barPixels / ratio,
					height: `${Math.max(8, height)}%`,
				}}
			/>
		));

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			className={cn("relative h-8 w-full min-w-0 overflow-hidden", className)}
		>
			<div className={cn("absolute inset-0 text-ink/25", unplayedClassName)}>{renderBars()}</div>
			<div
				className={cn("absolute inset-0 text-ink", playedClassName)}
				style={{ clipPath: `inset(0 ${100 - playedPercent}% 0 0)` }}
			>
				{renderBars()}
			</div>
		</div>
	);
}
