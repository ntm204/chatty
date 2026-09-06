import { LoaderCircle, Mic, Pause, Play, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { RECORDER_PRIMARY_CONTROL_CLASS, RECORDER_SECONDARY_CONTROL_CLASS } from "../constants/voice-recorder";
import { useVoicePlayer } from "../hooks/use-voice-player";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { formatDuration } from "../utils/format-duration";
import { VoiceWaveform } from "./voice-waveform";

interface VoiceRecorderProps {
	isDisabled: boolean;
	onSend: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	onActiveChange: (isActive: boolean) => void;
}

export function VoiceRecorder({ isDisabled, onSend, onActiveChange }: VoiceRecorderProps) {
	const { phase, elapsedMs, recording, error, waveform, start, stop, discard } = useVoiceRecorder();
	const [isSending, setIsSending] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | undefined>();
	const [uploadProgress, setUploadProgress] = useState(0);
	const [sendError, setSendError] = useState("");
	const isSendingRef = useRef(false);
	const isMountedRef = useRef(true);
	const preview = useVoicePlayer({ sourceUrl: previewUrl, durationMs: elapsedMs });
	const previewProgress = preview.durationMs > 0 ? preview.elapsedMs / preview.durationMs : 0;

	useEffect(() => onActiveChange(phase !== "idle"), [onActiveChange, phase]);

	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (!recording) {
			setPreviewUrl(undefined);

			return;
		}
		const objectUrl = URL.createObjectURL(recording);
		setPreviewUrl(objectUrl);

		return () => URL.revokeObjectURL(objectUrl);
	}, [recording]);

	async function send(): Promise<void> {
		if (!recording || isDisabled || isSendingRef.current) return;
		isSendingRef.current = true;
		setIsSending(true);
		setUploadProgress(0);
		setSendError("");
		preview.audioRef.current?.pause();
		try {
			await onSend(recording, (percent) => {
				if (isMountedRef.current && isSendingRef.current) {
					setUploadProgress(Math.round(Math.max(0, Math.min(100, percent))));
				}
			});
			if (isMountedRef.current) discard();
		} catch (caught) {
			if (isMountedRef.current) {
				setSendError(caught instanceof Error ? caught.message : "The voice message could not be sent");
			}
		} finally {
			isSendingRef.current = false;
			if (isMountedRef.current) setIsSending(false);
		}
	}

	function discardRecording(): void {
		if (isSendingRef.current) return;
		preview.audioRef.current?.pause();
		setSendError("");
		setUploadProgress(0);
		discard();
	}

	if (phase === "idle") {
		return (
			<div className="relative">
				<Button
					variant="ghost"
					onClick={() => {
						if (!isDisabled) void start();
					}}
					disabled={isDisabled}
					aria-label="Record a voice message"
					className={RECORDER_SECONDARY_CONTROL_CLASS}
				>
					<Mic className="size-4" />
				</Button>
				{error && (
					<p role="alert" className="absolute bottom-full right-0 mb-2 w-60 text-xs text-signal">
						{error}
					</p>
				)}
			</div>
		);
	}

	return (
		<div
			role="group"
			aria-label="Voice recorder"
			className="flex w-full min-w-0 flex-col gap-1.5 rounded-message bg-paper-sunken p-1.5 text-ink"
		>
			<audio ref={preview.audioRef} src={previewUrl} preload="metadata" className="hidden" />
			{phase === "requesting" ? (
				<div className="flex min-w-0 items-center gap-2">
					<Button
						variant="ghost"
						onClick={discardRecording}
						aria-label="Cancel recording"
						className={RECORDER_SECONDARY_CONTROL_CLASS}
					>
						<X className="size-4" />
					</Button>
					<LoaderCircle
						aria-hidden="true"
						className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
					/>
					<span role="status" className="text-xs text-ink-soft">
						Waiting for microphone…
					</span>
				</div>
			) : phase === "recording" ? (
				<div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
					<Button
						variant="ghost"
						onClick={discardRecording}
						aria-label="Cancel recording"
						className={RECORDER_SECONDARY_CONTROL_CLASS}
					>
						<X className="size-4" />
					</Button>
					<span className="flex shrink-0 items-center gap-1.5">
						<span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
						<span aria-label="Recording duration" className="meta text-xs text-ink">
							{formatDuration(elapsedMs)}
						</span>
					</span>
					<VoiceWaveform waveform={waveform} progress={1} className="h-5 min-w-0 flex-1" />
					<Button onClick={stop} aria-label="Stop recording" className={RECORDER_PRIMARY_CONTROL_CLASS}>
						<Square className="size-3.5 fill-current" />
					</Button>
				</div>
			) : (
				<div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
					<Button
						variant="ghost"
						onClick={() => void preview.togglePlayback()}
						disabled={isSending || !previewUrl}
						aria-label={preview.isPlaying ? "Pause recording preview" : "Play recording preview"}
						className="size-8 shrink-0 rounded-full bg-paper-raised p-0 text-ink hover:bg-paper-raised hover:opacity-80"
					>
						{preview.isLoading ? (
							<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
						) : preview.isPlaying ? (
							<Pause className="size-3.5 fill-current" />
						) : (
							<Play className="size-3.5 fill-current" />
						)}
					</Button>
					<div className="relative flex h-8 min-w-0 flex-1 items-center rounded-control focus-within:ring-2 focus-within:ring-ink/20">
						<VoiceWaveform waveform={waveform} progress={previewProgress} className="h-5" />
						<input
							type="range"
							min={0}
							max={preview.durationMs}
							step={100}
							value={Math.min(preview.elapsedMs, preview.durationMs)}
							onChange={(event) => preview.seek(Number(event.target.value) / preview.durationMs)}
							disabled={isSending || preview.durationMs <= 0 || !previewUrl}
							aria-label="Seek recording preview"
							aria-valuetext={formatDuration(preview.elapsedMs)}
							className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
						/>
					</div>
					<span className="meta shrink-0 text-xs text-ink-soft">{formatDuration(preview.durationMs)}</span>
					<Button
						variant="ghost"
						onClick={discardRecording}
						disabled={isSending}
						aria-label="Discard recording"
						className={RECORDER_SECONDARY_CONTROL_CLASS}
					>
						<Trash2 className="size-4" />
					</Button>
					<Button
						onClick={() => void send()}
						disabled={isDisabled || isSending}
						aria-label="Send voice message"
						className={RECORDER_PRIMARY_CONTROL_CLASS}
					>
						{isSending ? (
							<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
						) : (
							<Send className="size-3.5" />
						)}
					</Button>
				</div>
			)}
			{isSending && (
				<span role="status" className="meta px-2 text-ink-soft">
					Uploading {uploadProgress}%
				</span>
			)}
			{(sendError || preview.error) && (
				<p role="alert" className="px-2 text-xs text-signal">
					{sendError || preview.error}
				</p>
			)}
		</div>
	);
}
