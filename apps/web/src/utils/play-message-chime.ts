let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof AudioContext === "undefined") return null;
	sharedContext ??= new AudioContext();

	return sharedContext;
}

/** Two-note chime (A5 → E6) for an arriving message, synthesized so there is no audio file to fetch or license. */
export function playMessageChime(): void {
	const context = getAudioContext();
	if (!context) return;

	try {
		if (context.state === "suspended") void context.resume();

		const now = context.currentTime;
		const notes = [
			{ freq: 880, start: 0 },
			{ freq: 1318.51, start: 0.09 },
		];

		for (const { freq, start } of notes) {
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = "sine";
			oscillator.frequency.value = freq;

			const noteStart = now + start;
			gain.gain.setValueAtTime(0, noteStart);
			gain.gain.linearRampToValueAtTime(0.18, noteStart + 0.012);
			gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.4);

			oscillator.connect(gain);
			gain.connect(context.destination);
			oscillator.start(noteStart);
			oscillator.stop(noteStart + 0.45);
		}
	} catch {
		// Autoplay restrictions and unsupported browsers: a missed chime beats a crash.
	}
}
