import type { Page } from "@playwright/test";

/** A real PCM recording with speech-like pauses and changing amplitude. */
export function makeVoiceWave(seconds = 1): Buffer {
	const sampleRate = 8_000;
	const sampleCount = sampleRate * seconds;
	const dataSize = sampleCount * 2;
	const wave = Buffer.alloc(44 + dataSize);
	wave.write("RIFF", 0);
	wave.writeUInt32LE(36 + dataSize, 4);
	wave.write("WAVEfmt ", 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(sampleRate, 24);
	wave.writeUInt32LE(sampleRate * 2, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write("data", 36);
	wave.writeUInt32LE(dataSize, 40);
	for (let sample = 0; sample < sampleCount; sample += 1) {
		const time = sample / sampleRate;
		const amplitude = time % 2 > 1.55 ? 0.015 : 0.15 + 0.75 * Math.abs(Math.sin(time * 5.3));
		wave.writeInt16LE(Math.round(Math.sin(time * Math.PI * 440 * 2) * 12_000 * amplitude), 44 + sample * 2);
	}

	return wave;
}

/** Upload through the real transcoder, keeping media fixtures out of the UI interaction assertions. */
export async function sendVoiceFixture(page: Page, seconds = 8): Promise<string> {
	return page.evaluate(
		async ({ waveBase64, apiUrl }) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}` };
			const conversations = await fetch(`${apiUrl}/conversations`, { headers });
			const result = (await conversations.json()) as { items: { id: string }[] };
			const conversationId = result.items[0]?.id;
			if (!conversationId) throw new Error("Missing voice fixture conversation");
			const bytes = Uint8Array.from(atob(waveBase64), (character) => character.charCodeAt(0));
			const body = new FormData();
			body.append("voice", new Blob([bytes], { type: "audio/wav" }), "voice.wav");
			const response = await fetch(`${apiUrl}/conversations/${conversationId}/messages`, {
				method: "POST",
				headers,
				body,
			});
			if (!response.ok) throw new Error(`Voice fixture failed: ${response.status}`);
			const message = (await response.json()) as { id: string };

			return message.id;
		},
		{
			waveBase64: makeVoiceWave(seconds).toString("base64"),
			apiUrl: process.env.E2E_API_URL ?? "http://localhost:4100",
		},
	);
}
