import { useEffect, useRef, useState } from "react";
import {
	LIVE_VOICE_WAVEFORM_BARS,
	MAX_VOICE_RECORDING_MS,
	PREVIEW_VOICE_WAVEFORM_BARS,
	VOICE_RECORDER_CHUNK_MS,
	VOICE_RECORDER_MIME_TYPES,
	VOICE_SAMPLE_INTERVAL_MS,
} from "../constants/voice-recorder";
import type { VoiceRecorderPhase } from "../types/voice-recorder";
import { getRecordingError } from "../utils/recording-error";
import { getVoiceWaveform } from "../utils/voice-waveform";
import { stopActiveVoicePlayback } from "./use-voice-player";

export function useVoiceRecorder() {
	const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
	const [elapsedMs, setElapsedMs] = useState(0);
	const [recording, setRecording] = useState<Blob | null>(null);
	const [error, setError] = useState("");
	const [waveform, setWaveform] = useState<number[]>([]);
	const phaseRef = useRef<VoiceRecorderPhase>("idle");
	const isMountedRef = useRef(true);
	const requestGenerationRef = useRef(0);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const timerRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const audioContextRef = useRef<AudioContext | null>(null);
	const detachListenersRef = useRef<(() => void) | null>(null);

	function transitionTo(nextPhase: VoiceRecorderPhase): void {
		phaseRef.current = nextPhase;
		setPhase(nextPhase);
	}

	function release(): void {
		if (timerRef.current !== null) window.clearInterval(timerRef.current);
		timerRef.current = null;
		detachListenersRef.current?.();
		detachListenersRef.current = null;
		const recorder = recorderRef.current;
		recorderRef.current = null;
		if (recorder && recorder.state !== "inactive") recorder.stop();
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		void audioContextRef.current?.close().catch(() => undefined);
		audioContextRef.current = null;
	}

	async function start(): Promise<void> {
		if (!isMountedRef.current || phaseRef.current !== "idle") return;
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
			setError(
				window.isSecureContext
					? "Voice recording is not supported in this browser."
					: "Microphone recording requires HTTPS or localhost.",
			);

			return;
		}
		const generation = ++requestGenerationRef.current;
		const isCurrent = () => isMountedRef.current && generation === requestGenerationRef.current;
		stopActiveVoicePlayback();
		transitionTo("requesting");
		setError("");
		setRecording(null);
		setElapsedMs(0);
		setWaveform([]);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			// A permission prompt can outlive both its cancel button and the whole composer.
			if (!isCurrent()) {
				stream.getTracks().forEach((track) => track.stop());

				return;
			}
			streamRef.current = stream;
			// Someone may have started another message while the permission prompt was open.
			stopActiveVoicePlayback();
			const audioContext = new AudioContext();
			audioContextRef.current = audioContext;
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			audioContext.createMediaStreamSource(stream).connect(analyser);
			const audioSamples = new Uint8Array(analyser.fftSize);
			const measuredPeaks: number[] = [];
			const mimeType = VOICE_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
			const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			recorderRef.current = recorder;
			const chunks: Blob[] = [];

			function collectData(event: BlobEvent): void {
				if (isCurrent() && event.data.size > 0) chunks.push(event.data);
			}

			function finishRecording(): void {
				if (!isCurrent()) return;
				const duration = Math.min(MAX_VOICE_RECORDING_MS, Date.now() - startedAtRef.current);
				const blob = new Blob(chunks, { type: recorder.mimeType });
				release();
				if (blob.size === 0) {
					setError("No audio was recorded. Try again.");
					transitionTo("idle");

					return;
				}
				setRecording(blob);
				setElapsedMs(duration);
				setWaveform(getVoiceWaveform(measuredPeaks, PREVIEW_VOICE_WAVEFORM_BARS));
				transitionTo("preview");
			}

			function failRecording(): void {
				if (!isCurrent()) return;
				requestGenerationRef.current += 1;
				release();
				setError("Recording stopped because the microphone became unavailable. Try again.");
				transitionTo("idle");
			}

			const tracks = stream.getAudioTracks();
			recorder.addEventListener("dataavailable", collectData);
			recorder.addEventListener("stop", finishRecording);
			recorder.addEventListener("error", failRecording);
			tracks.forEach((track) => track.addEventListener("ended", failRecording));
			detachListenersRef.current = () => {
				recorder.removeEventListener("dataavailable", collectData);
				recorder.removeEventListener("stop", finishRecording);
				recorder.removeEventListener("error", failRecording);
				tracks.forEach((track) => track.removeEventListener("ended", failRecording));
			};
			startedAtRef.current = Date.now();
			recorder.start(VOICE_RECORDER_CHUNK_MS);
			transitionTo("recording");
			timerRef.current = window.setInterval(() => {
				if (!isCurrent() || recorder.state !== "recording") return;
				analyser.getByteTimeDomainData(audioSamples);
				let sumSquares = 0;
				for (const sample of audioSamples) {
					const normalized = (sample - 128) / 128;
					sumSquares += normalized * normalized;
				}
				measuredPeaks.push(Math.min(100, Math.sqrt(sumSquares / audioSamples.length) * 400));
				const recent = measuredPeaks.slice(-LIVE_VOICE_WAVEFORM_BARS);
				setWaveform([...Array<number>(LIVE_VOICE_WAVEFORM_BARS - recent.length).fill(0), ...recent]);
				const duration = Math.min(MAX_VOICE_RECORDING_MS, Date.now() - startedAtRef.current);
				setElapsedMs(duration);
				if (duration >= MAX_VOICE_RECORDING_MS) recorder.stop();
			}, VOICE_SAMPLE_INTERVAL_MS);
		} catch (caught) {
			if (!isCurrent()) return;
			release();
			setError(getRecordingError(caught));
			transitionTo("idle");
		}
	}

	function stop(): void {
		if (recorderRef.current?.state === "recording") recorderRef.current.stop();
	}

	function discard(): void {
		requestGenerationRef.current += 1;
		release();
		setRecording(null);
		setElapsedMs(0);
		setWaveform([]);
		setError("");
		transitionTo("idle");
	}

	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
			requestGenerationRef.current += 1;
			release();
		};
	}, []);

	return { phase, elapsedMs, recording, error, waveform, start, stop, discard };
}
