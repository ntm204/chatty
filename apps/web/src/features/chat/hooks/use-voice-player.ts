import { useEffect, useRef, useState } from "react";
import { VOICE_PLAYBACK_ERROR, VOICE_PROGRESS_INTERVAL_MS } from "../constants/voice-playback";

interface UseVoicePlayerOptions {
	sourceUrl?: string | undefined;
	durationMs?: number | undefined;
}

interface VoicePlaybackSession {
	audio: HTMLAudioElement;
	requestId: number;
	wantsPlayback: boolean;
	stop: () => void;
}

// Ownership includes a pending play request, so a second player can cancel it before it becomes audible.
let activeSession: VoicePlaybackSession | null = null;

/** Stop playback before the microphone starts, including a still-pending play request. */
export function stopActiveVoicePlayback(): void {
	activeSession?.stop();
}

export function useVoicePlayer({ sourceUrl, durationMs: suppliedDurationMs = 0 }: UseVoicePlayerOptions = {}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const sessionRef = useRef<VoicePlaybackSession | null>(null);
	const rateRef = useRef(1);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [metadataDurationMs, setMetadataDurationMs] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [error, setError] = useState("");
	const fallbackDurationMs = Number.isFinite(suppliedDurationMs) && suppliedDurationMs > 0 ? suppliedDurationMs : 0;
	const durationMs = metadataDurationMs || fallbackDurationMs;

	useEffect(() => {
		const element = audioRef.current;
		if (!element) return;
		const audio: HTMLAudioElement = element;
		let isCurrent = true;
		let frameId: number | null = null;
		let lastProgressAt = 0;
		const session: VoicePlaybackSession = { audio, requestId: 0, wantsPlayback: false, stop: stopPlayback };
		sessionRef.current = session;
		rateRef.current = 1;
		audio.playbackRate = 1;
		setPlaybackRate(1);
		setIsPlaying(false);
		setIsLoading(false);
		setElapsedMs(0);
		setMetadataDurationMs(0);
		setError("");

		function updateElapsed(): void {
			if (isCurrent) setElapsedMs(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime * 1000) : 0);
		}

		function updateDuration(): void {
			if (isCurrent)
				setMetadataDurationMs(
					Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : 0,
				);
		}

		function stopProgress(): void {
			if (frameId !== null) window.cancelAnimationFrame(frameId);
			frameId = null;
		}

		function updateProgress(timestamp: number): void {
			frameId = null;
			if (!isCurrent || !session.wantsPlayback || activeSession !== session || audio.paused) return;
			if (timestamp - lastProgressAt >= VOICE_PROGRESS_INTERVAL_MS) {
				updateElapsed();
				lastProgressAt = timestamp;
			}
			frameId = window.requestAnimationFrame(updateProgress);
		}

		function settleStopped(): void {
			session.requestId += 1;
			session.wantsPlayback = false;
			if (activeSession === session) activeSession = null;
			stopProgress();
			if (!isCurrent) return;
			setIsPlaying(false);
			setIsLoading(false);
			updateElapsed();
		}

		function stopPlayback(): void {
			settleStopped();
			audio.pause();
		}

		function canPlay(): boolean {
			if (isCurrent && session.wantsPlayback && activeSession === session) return true;
			if (!audio.paused) audio.pause();

			return false;
		}

		function onPlay(): void {
			if (!canPlay()) return;
			setIsPlaying(true);
			setIsLoading(true);
		}

		function onPlaying(): void {
			if (!canPlay()) return;
			setIsPlaying(true);
			setIsLoading(false);
			updateElapsed();
			if (frameId === null) frameId = window.requestAnimationFrame(updateProgress);
		}

		function onWaiting(): void {
			if (!session.wantsPlayback || activeSession !== session) return;
			setIsLoading(true);
			stopProgress();
		}

		function onPause(): void {
			// A queued pause event can arrive after a newer play call has already resumed this element.
			if (audio.paused) settleStopped();
		}

		function onError(): void {
			stopPlayback();
			if (isCurrent) setError(VOICE_PLAYBACK_ERROR);
		}

		audio.addEventListener("loadedmetadata", updateDuration);
		audio.addEventListener("durationchange", updateDuration);
		audio.addEventListener("timeupdate", updateElapsed);
		audio.addEventListener("play", onPlay);
		audio.addEventListener("playing", onPlaying);
		audio.addEventListener("waiting", onWaiting);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("ended", settleStopped);
		audio.addEventListener("error", onError);
		if (audio.readyState >= 1) updateDuration();

		return () => {
			isCurrent = false;
			stopPlayback();
			audio.removeEventListener("loadedmetadata", updateDuration);
			audio.removeEventListener("durationchange", updateDuration);
			audio.removeEventListener("timeupdate", updateElapsed);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("playing", onPlaying);
			audio.removeEventListener("waiting", onWaiting);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("ended", settleStopped);
			audio.removeEventListener("error", onError);
			if (sessionRef.current === session) sessionRef.current = null;
		};
	}, [sourceUrl]);

	async function togglePlayback(): Promise<void> {
		const session = sessionRef.current;
		if (!session) return;
		const { audio } = session;
		if (session.wantsPlayback || !audio.paused) {
			session.stop();

			return;
		}
		if (activeSession && activeSession !== session) activeSession.stop();
		activeSession = session;
		session.wantsPlayback = true;
		const requestId = ++session.requestId;
		setError("");
		setIsLoading(true);
		try {
			if (audio.error) audio.load();
			if (audio.ended || (durationMs > 0 && audio.currentTime * 1000 >= durationMs)) {
				audio.currentTime = 0;
				setElapsedMs(0);
			}
			await audio.play();
			if (sessionRef.current !== session || session.requestId !== requestId || activeSession !== session) {
				// A late completion must stop its old element without pausing a newer attempt on the same element.
				if (activeSession?.audio !== audio) audio.pause();
			}
		} catch {
			if (sessionRef.current !== session || session.requestId !== requestId || activeSession !== session) return;
			session.stop();
			setError(VOICE_PLAYBACK_ERROR);
		}
	}

	function cyclePlaybackRate(): void {
		const next = rateRef.current === 1 ? 1.5 : rateRef.current === 1.5 ? 2 : 1;
		rateRef.current = next;
		setPlaybackRate(next);
		if (audioRef.current) audioRef.current.playbackRate = next;
	}

	function seek(fraction: number): void {
		const audio = audioRef.current;
		if (!audio || Number.isNaN(fraction)) return;
		const totalMs = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : durationMs;
		if (totalMs <= 0) return;
		const nextElapsedMs = Math.max(0, Math.min(1, fraction)) * totalMs;
		try {
			audio.currentTime = nextElapsedMs / 1000;
			setElapsedMs(nextElapsedMs);
		} catch {
			setError("Audio position could not be changed");
		}
	}

	return {
		audioRef,
		isPlaying,
		elapsedMs,
		playbackRate,
		durationMs,
		isLoading,
		error,
		togglePlayback,
		cyclePlaybackRate,
		seek,
	};
}
