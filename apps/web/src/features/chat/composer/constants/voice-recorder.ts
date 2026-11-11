export const MAX_VOICE_RECORDING_MS: number = 5 * 60 * 1000;
export const VOICE_SAMPLE_INTERVAL_MS: number = 100;
export const VOICE_RECORDER_CHUNK_MS: number = 250;
export const LIVE_VOICE_WAVEFORM_BARS: number = 48;
export const PREVIEW_VOICE_WAVEFORM_BARS: number = 64;
export const VOICE_RECORDER_MIME_TYPES: readonly string[] = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

export const RECORDER_SECONDARY_CONTROL_CLASS: string =
	"size-8 shrink-0 rounded-full p-0 text-ink-soft hover:bg-transparent hover:text-ink";
export const RECORDER_PRIMARY_CONTROL_CLASS: string =
	"size-8 shrink-0 rounded-full bg-block p-0 text-block-ink hover:bg-block hover:opacity-80";
