import {
	VOICE_WAVE_MAX_PX,
	VOICE_WAVE_MIN_PX,
	VOICE_WAVE_PX_PER_SECOND,
	VOICE_WAVEFORM_BARS,
} from "../constants/voice";

export function formatDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Preserve the recorded peaks and pauses; missing samples get a quiet baseline. */
export function getVoiceWaveform(samples: number[], barCount = VOICE_WAVEFORM_BARS): number[] {
	return Array.from({ length: barCount }, (_, index) => {
		const start = Math.floor((index * samples.length) / barCount);
		const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / barCount));
		let peak = 0;
		for (let offset = start; offset < end; offset += 1) {
			const sample = samples[offset] ?? 0;
			if (Number.isFinite(sample)) peak = Math.max(peak, sample);
		}

		return Math.min(100, peak);
	});
}

/** Longer recordings get a longer waveform, so length reads at a glance before playing. */
export function getVoiceWaveWidth(durationMs: number): number {
	const seconds = Math.max(0, durationMs / 1000);

	return Math.round(Math.min(VOICE_WAVE_MAX_PX, VOICE_WAVE_MIN_PX + seconds * VOICE_WAVE_PX_PER_SECOND));
}
