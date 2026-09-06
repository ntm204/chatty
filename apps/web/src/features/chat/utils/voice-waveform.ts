import { VOICE_WAVEFORM_BARS } from "../constants/voice-waveform";

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
