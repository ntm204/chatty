import { useMemo } from "react";
import { cn } from "@/utils/cn";
import { getVoiceWaveform } from "../utils/voice-waveform";

interface VoiceWaveformProps {
	waveform: number[];
	progress?: number;
	className?: string;
	playedClassName?: string;
	unplayedClassName?: string;
}

/** Recorded sound is a static shape; only the playback position moves through it. */
export function VoiceWaveform({
	waveform,
	progress = 0,
	className,
	playedClassName,
	unplayedClassName,
}: VoiceWaveformProps) {
	const bars = useMemo(() => getVoiceWaveform(waveform), [waveform]);
	const playedPercent = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) * 100 : 0;

	return (
		<div aria-hidden="true" className={cn("relative h-8 w-full min-w-0", className)}>
			<div className={cn("flex h-full items-center gap-0.5 text-ink/25", unplayedClassName)}>
				{bars.map((height, index) => (
					<span
						key={index}
						className="min-w-0 flex-1 rounded-full bg-current"
						style={{ height: `${Math.max(8, height)}%` }}
					/>
				))}
			</div>
			<div
				className={cn("absolute inset-0 flex items-center gap-0.5 text-ink", playedClassName)}
				style={{ clipPath: `inset(0 ${100 - playedPercent}% 0 0)` }}
			>
				{bars.map((height, index) => (
					<span
						key={index}
						className="min-w-0 flex-1 rounded-full bg-current"
						style={{ height: `${Math.max(8, height)}%` }}
					/>
				))}
			</div>
		</div>
	);
}
