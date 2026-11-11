import { OFFLINE_BINARY_URL } from "@/constants/offline-media";
import { api } from "@/api/client";
import type { AttachmentDTO, ConversationTheme } from "@chatty/shared-types";
import { LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../../constants/conversation-theme";
import { useVoicePlayer } from "../hooks/use-voice-player";
import { formatDuration, getVoiceWaveWidth } from "../utils/voice";
import { VoiceWaveform } from "./voice-waveform";

interface VoicePlayerProps {
	attachment: AttachmentDTO;
	isMine?: boolean;
	/** The conversation's shared accent, replacing the fixed default for "mine" surfaces — see ADR 0022. */
	themeColor?: ConversationTheme | null;
	className?: string;
	/** The bubble's time and ticks, set at the end of the duration line as Telegram does. */
	meta?: ReactNode;
}

export function VoicePlayer({ attachment, isMine = false, themeColor = null, className, meta }: VoicePlayerProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const theme = getConversationThemeClasses(themeColor);
	const isOffline = attachment.url === OFFLINE_BINARY_URL;
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
	} = useVoicePlayer({
		sourceUrl: isOffline ? undefined : attachment.url,
		durationMs: attachment.durationMs ?? 0,
		resolveSource: async () => (await api.getAttachmentUrls(attachment.id)).url,
	});
	const playedFraction = durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0;
	const elapsedLabel = formatDuration(Math.min(elapsedMs, durationMs));
	const durationLabel = formatDuration(durationMs);
	const waveWidth = getVoiceWaveWidth(durationMs);
	useEffect(() => {
		const speedControl = rootRef.current?.querySelector<HTMLButtonElement>("[data-playback-speed]");
		// Playback may end while the speed button owns keyboard focus. Keep that
		// focus in the player rather than on a control hidden from assistive technology.
		if (!isPlaying && speedControl && document.activeElement === speedControl) {
			rootRef.current?.querySelector<HTMLButtonElement>("[data-playback-toggle]")?.focus({ preventScroll: true });
		}
	}, [isPlaying]);

	return (
		<div
			ref={rootRef}
			role="group"
			aria-label="Voice message"
			className={cn(
				"voice-message inline-flex min-w-0 max-w-full flex-col rounded-[18px] py-2 pl-2 pr-3.5",
				isMine ? cn(theme.bubble, theme.bubbleInk) : "bg-paper-sunken text-ink",
				className,
			)}
		>
			<audio ref={audioRef} src={isOffline ? undefined : attachment.url} preload="none" />
			<div className="flex items-center gap-2.5">
				<Button
					data-playback-toggle
					variant="ghost"
					onClick={() => void togglePlayback()}
					disabled={isOffline}
					title={isOffline ? "Connect to download this voice message" : undefined}
					aria-label={
						error ? "Retry voice message" : isPlaying ? "Pause voice message" : "Play voice message"
					}
					className={cn(
						"voice-player-toggle relative size-10 shrink-0 rounded-full p-0 hover:bg-transparent",
						isMine ? theme.bubbleInk : "text-heading",
					)}
				>
					{/* A disc in the bubble's ink colour, so it follows the theme and dark mode with no new tokens. */}
					<span aria-hidden="true" className="absolute inset-0 rounded-full bg-current" />
					<span className="relative text-paper">
						{isLoading ? (
							<LoaderCircle className="size-4 motion-safe:animate-spin" />
						) : error ? (
							<RotateCcw className="size-4" />
						) : isPlaying ? (
							<Pause className="size-4 fill-current" strokeWidth={0} />
						) : (
							<Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
						)}
					</span>
				</Button>
				<div className="flex min-w-0 grow flex-col gap-0.5" style={{ minWidth: waveWidth }}>
					<div
						className={cn(
							"relative flex h-6 items-center rounded-control focus-within:ring-2",
							isMine ? theme.ring : "focus-within:ring-ink/25",
						)}
					>
						<span className="sr-only">
							Duration {durationLabel}. Playback speed {playbackRate} times.
						</span>
						<VoiceWaveform
							waveform={attachment.waveform}
							progress={playedFraction}
							className="h-6"
							barCount={Math.round(waveWidth / 4)}
							playedClassName={isMine ? theme.bubbleInk : "text-heading"}
							unplayedClassName={isMine ? theme.unplayed : "text-ink/30"}
						/>
						<input
							type="range"
							min={0}
							max={Math.max(1, durationMs / 1000)}
							step={0.1}
							value={Math.min(elapsedMs, durationMs) / 1000}
							disabled={isOffline || durationMs <= 0}
							onChange={(event) => seek((Number(event.target.value) * 1000) / durationMs)}
							aria-label="Seek voice message"
							aria-valuetext={`${elapsedLabel} of ${durationLabel}`}
							className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
						/>
					</div>
					<div className="voice-player-meta flex h-4 items-center gap-1.5" data-playing={isPlaying}>
						<span className="text-[11px] leading-4 tabular-nums opacity-70">
							{elapsedMs > 0 ? elapsedLabel : durationLabel}
						</span>
						<Button
							data-playback-speed
							variant="ghost"
							onClick={cyclePlaybackRate}
							aria-label="Change playback speed"
							aria-description={`Current speed: ${playbackRate} times`}
							aria-hidden={!isPlaying}
							tabIndex={isPlaying ? 0 : -1}
							className={cn(
								"voice-player-speed h-4 min-h-0 rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-semibold leading-none hover:bg-current/15",
								isMine ? theme.accentText : "text-ink-soft hover:text-ink",
							)}
						>
							{playbackRate}×
						</Button>
						{meta && <span className="voice-player-time ml-auto whitespace-nowrap pl-3">{meta}</span>}
					</div>
				</div>
			</div>
			{isOffline && <p className="mt-2 text-xs">Connect to download this voice message.</p>}
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
