import type { AttachmentDTO, ConversationTheme } from "@chatty/shared-types";
import { LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../constants/conversation-theme";
import { useVoicePlayer } from "../hooks/use-voice-player";
import { formatDuration } from "../utils/format-duration";
import { VoiceWaveform } from "./voice-waveform";

interface VoicePlayerProps {
	attachment: AttachmentDTO;
	isMine?: boolean;
	/** The conversation's shared accent, replacing the fixed default for "mine" surfaces — see ADR 0022. */
	themeColor?: ConversationTheme | null;
	className?: string;
}

export function VoicePlayer({ attachment, isMine = false, themeColor = null, className }: VoicePlayerProps) {
	const theme = getConversationThemeClasses(themeColor);
	const {
		audioRef,
		isPlaying,
		isLoading,
		error,
		elapsedMs,
		durationMs,
		playbackRate,
		togglePlayback,
		cyclePlaybackRate,
		seek,
	} = useVoicePlayer({ sourceUrl: attachment.url, durationMs: attachment.durationMs ?? 0 });
	const playedFraction = durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0;
	const elapsedLabel = formatDuration(Math.min(elapsedMs, durationMs));
	const durationLabel = formatDuration(durationMs);

	return (
		<div
			role="group"
			aria-label="Voice message"
			className={cn(
				"voice-message w-64 min-w-0 max-w-full rounded-[18px] px-2.5 py-2.5",
				isMine ? cn(theme.bubble, theme.bubbleInk) : "bg-paper-sunken text-ink",
				className,
			)}
		>
			<audio ref={audioRef} src={attachment.url} preload="none" />
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					onClick={() => void togglePlayback()}
					aria-label={
						error ? "Retry voice message" : isPlaying ? "Pause voice message" : "Play voice message"
					}
					className={cn("size-8 shrink-0 rounded-full p-0", "bg-scrim/35 text-on-media hover:bg-scrim/45")}
				>
					{isLoading ? (
						<LoaderCircle className="size-3.5 motion-safe:animate-spin" />
					) : error ? (
						<RotateCcw className="size-3.5" />
					) : isPlaying ? (
						<Pause className="size-3.5 fill-current" />
					) : (
						<Play className="ml-0.5 size-3.5 fill-current" />
					)}
				</Button>
				<div className="min-w-0 flex-1">
					<div
						className={cn(
							"relative flex h-10 items-center rounded-control focus-within:ring-2",
							isMine ? theme.ring : "focus-within:ring-ink/25",
						)}
					>
						<VoiceWaveform
							waveform={attachment.waveform}
							progress={playedFraction}
							className="h-8"
							barCount={28}
							playedClassName={isMine ? theme.bubbleInk : "text-ink"}
							unplayedClassName={
								elapsedMs === 0
									? isMine
										? theme.bubbleInk
										: "text-ink"
									: isMine
										? theme.unplayed
										: "text-ink/25"
							}
						/>
						{elapsedMs > 0 && playedFraction < 1 && (
							<span
								aria-hidden="true"
								className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current shadow-sm"
								style={{ left: `${playedFraction * 100}%` }}
							/>
						)}
						<input
							type="range"
							min={0}
							max={Math.max(1, durationMs / 1000)}
							step={0.1}
							value={Math.min(elapsedMs, durationMs) / 1000}
							disabled={durationMs <= 0}
							onChange={(event) => seek((Number(event.target.value) * 1000) / durationMs)}
							aria-label="Seek voice message"
							aria-valuetext={`${elapsedLabel} of ${durationLabel}`}
							className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
						/>
					</div>
				</div>
				<div
					className="voice-player-meta relative flex h-10 w-7 shrink-0 items-center justify-center"
					data-playing={isPlaying}
				>
					<span className="voice-player-duration text-[10px] leading-3 tabular-nums">
						{elapsedMs > 0 ? formatDuration(Math.max(0, durationMs - elapsedMs)) : durationLabel}
					</span>
					<Button
						variant="ghost"
						onClick={cyclePlaybackRate}
						aria-label="Change playback speed"
						aria-description={`Current speed: ${playbackRate} times`}
						aria-hidden={!isPlaying}
						tabIndex={isPlaying ? 0 : -1}
						className={cn(
							"voice-player-speed absolute bottom-0 h-5 min-h-0 w-7 shrink-0 rounded-full bg-scrim/10 p-0 text-[10px] leading-none hover:bg-scrim/20",
							isMine ? theme.accentText : "text-ink-soft hover:text-ink",
						)}
					>
						{playbackRate}×
					</Button>
				</div>
			</div>
			{isLoading && (
				<span role="status" className="sr-only">
					Loading audio
				</span>
			)}
			{error && (
				<p role="alert" className={cn("mt-2 text-xs", isMine ? theme.bubbleInk : "text-signal")}>
					{error}
				</p>
			)}
		</div>
	);
}
