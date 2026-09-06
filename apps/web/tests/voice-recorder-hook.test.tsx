import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "@/features/chat/hooks/use-voice-recorder";

const recorders: TestMediaRecorder[] = [];
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const closeAudioContext = vi.fn<() => Promise<void>>();
let sampleValue = 128;

class TestMediaRecorder extends EventTarget {
	static isTypeSupported = () => true;
	state: RecordingState = "inactive";
	mimeType = "audio/webm";

	constructor() {
		super();
		recorders.push(this);
	}

	start() {
		this.state = "recording";
	}

	stop() {
		this.state = "inactive";
		const data = new Event("dataavailable");
		Object.defineProperty(data, "data", { value: new Blob(["recorded audio"], { type: this.mimeType }) });
		this.dispatchEvent(data);
		this.dispatchEvent(new Event("stop"));
	}
}

class TestAudioContext {
	createAnalyser() {
		return {
			fftSize: 256,
			getByteTimeDomainData: (samples: Uint8Array) => samples.fill(sampleValue),
		};
	}

	createMediaStreamSource() {
		return { connect: vi.fn() };
	}

	close = closeAudioContext;
}

function makeStream() {
	const track = Object.assign(new EventTarget(), { stop: vi.fn() });
	const stream = {
		getTracks: () => [track],
		getAudioTracks: () => [track],
	} as unknown as MediaStream;

	return { stream, track };
}

beforeEach(() => {
	vi.useFakeTimers();
	recorders.length = 0;
	sampleValue = 128;
	getUserMedia.mockReset();
	closeAudioContext.mockReset().mockResolvedValue(undefined);
	vi.stubGlobal("isSecureContext", true);
	vi.stubGlobal("MediaRecorder", TestMediaRecorder);
	vi.stubGlobal("AudioContext", TestAudioContext);
	vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("useVoiceRecorder", () => {
	it("allows only one microphone request before permission resolves", async () => {
		const { stream } = makeStream();
		let resolvePermission!: (stream: MediaStream) => void;
		getUserMedia.mockReturnValue(
			new Promise((resolve) => {
				resolvePermission = resolve;
			}),
		);
		const { result } = renderHook(useVoiceRecorder);
		let startPromise!: Promise<void>;

		act(() => {
			startPromise = result.current.start();
			void result.current.start();
		});
		expect(result.current.phase).toBe("requesting");
		expect(getUserMedia).toHaveBeenCalledTimes(1);

		await act(async () => {
			resolvePermission(stream);
			await startPromise;
		});
		expect(result.current.phase).toBe("recording");
		expect(recorders).toHaveLength(1);
	});

	it.each(["cancel", "unmount"])("releases a permission result that arrives after %s", async (action) => {
		const { stream, track } = makeStream();
		let resolvePermission!: (stream: MediaStream) => void;
		getUserMedia.mockReturnValue(
			new Promise((resolve) => {
				resolvePermission = resolve;
			}),
		);
		const { result, unmount } = renderHook(useVoiceRecorder);
		let startPromise!: Promise<void>;
		act(() => {
			startPromise = result.current.start();
		});

		if (action === "cancel") act(() => result.current.discard());
		else unmount();
		await act(async () => {
			resolvePermission(stream);
			await startPromise;
		});

		expect(track.stop).toHaveBeenCalledTimes(1);
		expect(recorders).toHaveLength(0);
		if (action === "cancel") expect(result.current.phase).toBe("idle");
	});

	it("keeps actual silence and sound in the preview and releases the microphone on stop", async () => {
		const { stream, track } = makeStream();
		getUserMedia.mockResolvedValue(stream);
		const { result } = renderHook(useVoiceRecorder);
		await act(async () => result.current.start());

		act(() => vi.advanceTimersByTime(100));
		expect(result.current.waveform.every((height) => height === 0)).toBe(true);
		sampleValue = 160;
		act(() => vi.advanceTimersByTime(100));
		act(() => result.current.stop());

		expect(result.current.phase).toBe("preview");
		expect(result.current.recording?.size).toBeGreaterThan(0);
		expect(result.current.waveform.some((height) => height === 0)).toBe(true);
		expect(result.current.waveform.some((height) => height > 0)).toBe(true);
		expect(track.stop).toHaveBeenCalledTimes(1);
		expect(closeAudioContext).toHaveBeenCalledTimes(1);
	});

	it("stops at five minutes and retains a recording to preview", async () => {
		getUserMedia.mockResolvedValue(makeStream().stream);
		const { result } = renderHook(useVoiceRecorder);
		await act(async () => result.current.start());

		act(() => vi.advanceTimersByTime(300_000));

		expect(result.current.phase).toBe("preview");
		expect(result.current.elapsedMs).toBe(300_000);
		expect(result.current.recording?.size).toBeGreaterThan(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("returns to an actionable state when microphone permission is denied", async () => {
		getUserMedia.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
		const { result } = renderHook(useVoiceRecorder);
		await act(async () => result.current.start());

		expect(result.current.phase).toBe("idle");
		expect(result.current.error).toBe("Microphone permission was denied.");
		expect(recorders).toHaveLength(0);
	});

	it("releases capture resources when the microphone disconnects", async () => {
		const { stream, track } = makeStream();
		getUserMedia.mockResolvedValue(stream);
		const { result } = renderHook(useVoiceRecorder);
		await act(async () => result.current.start());
		act(() => track.dispatchEvent(new Event("ended")));

		expect(result.current.phase).toBe("idle");
		expect(result.current.error).toContain("microphone became unavailable");
		expect(track.stop).toHaveBeenCalledTimes(1);
		expect(closeAudioContext).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
