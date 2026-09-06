import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoicePlayer } from "@/features/chat/hooks/use-voice-player";

const animationFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

beforeEach(() => {
	animationFrames.clear();
	nextFrameId = 0;
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
		const frameId = ++nextFrameId;
		animationFrames.set(frameId, callback);

		return frameId;
	});
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
		animationFrames.delete(frameId);
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function createAudio() {
	const audio = document.createElement("audio");
	const state = { isPaused: true, hasEnded: false, durationSeconds: Number.NaN };
	Object.defineProperties(audio, {
		paused: { get: () => state.isPaused },
		ended: { get: () => state.hasEnded },
		duration: { get: () => state.durationSeconds },
	});
	const play = vi.spyOn(audio, "play").mockImplementation(() => {
		state.isPaused = false;
		state.hasEnded = false;
		audio.dispatchEvent(new Event("play"));
		audio.dispatchEvent(new Event("playing"));

		return Promise.resolve();
	});
	const pause = vi.spyOn(audio, "pause").mockImplementation(() => {
		const wasPlaying = !state.isPaused;
		state.isPaused = true;
		if (wasPlaying) audio.dispatchEvent(new Event("pause"));
	});

	return { audio, state, play, pause };
}

type TestAudio = ReturnType<typeof createAudio>;
type PlayerOptions = Parameters<typeof useVoicePlayer>[0];

function renderPlayer(media: TestAudio, options?: PlayerOptions) {
	return renderHook(
		(props: PlayerOptions) => {
			const player = useVoicePlayer(props);
			// Attach the real media element before effects, as React does for the component's audio ref.
			Object.assign(player.audioRef, { current: media.audio });

			return player;
		},
		{ initialProps: options },
	);
}

function delayNextPlay(media: TestAudio): () => void {
	let finish = () => {};
	const playbackPromise = new Promise<void>((resolve) => {
		finish = () => {
			// Simulate an unusually late browser completion, even after pause was requested.
			media.state.isPaused = false;
			media.audio.dispatchEvent(new Event("playing"));
			resolve();
		};
	});
	media.play.mockImplementationOnce(() => {
		media.state.isPaused = false;
		media.audio.dispatchEvent(new Event("play"));

		return playbackPromise;
	});

	return () => finish();
}

describe("useVoicePlayer", () => {
	it("reports a rejected play without rejecting the action and allows retry", async () => {
		const media = createAudio();
		media.play.mockRejectedValueOnce(new Error("Playback was denied"));
		const view = renderPlayer(media);

		await act(async () => {
			await expect(view.result.current.togglePlayback()).resolves.toBeUndefined();
		});
		expect(view.result.current.error).toContain("Try again");
		expect(view.result.current.isPlaying).toBe(false);
		expect(view.result.current.isLoading).toBe(false);

		await act(() => view.result.current.togglePlayback());
		expect(media.play).toHaveBeenCalledTimes(2);
		expect(view.result.current.error).toBe("");
		expect(view.result.current.isPlaying).toBe(true);
		expect(view.result.current.isLoading).toBe(false);
	});

	it("uses finite metadata duration with a fallback and seeks immediately within its bounds", () => {
		const media = createAudio();
		const view = renderPlayer(media, { durationMs: 8_000 });
		expect(view.result.current.durationMs).toBe(8_000);

		act(() => view.result.current.seek(0.25));
		expect(media.audio.currentTime).toBe(2);
		expect(view.result.current.elapsedMs).toBe(2_000);
		act(() => {
			media.state.durationSeconds = Number.POSITIVE_INFINITY;
			media.audio.dispatchEvent(new Event("durationchange"));
		});
		expect(view.result.current.durationMs).toBe(8_000);

		act(() => {
			media.state.durationSeconds = 12;
			media.audio.dispatchEvent(new Event("loadedmetadata"));
		});
		expect(view.result.current.durationMs).toBe(12_000);
		act(() => view.result.current.seek(2));
		expect(media.audio.currentTime).toBe(12);
		expect(view.result.current.elapsedMs).toBe(12_000);
		act(() => view.result.current.seek(-1));
		expect(media.audio.currentTime).toBe(0);
		expect(view.result.current.elapsedMs).toBe(0);
		act(() => view.result.current.seek(Number.NaN));
		expect(media.audio.currentTime).toBe(0);
	});

	it("stays usable before any valid duration is available", () => {
		const media = createAudio();
		const view = renderPlayer(media, { durationMs: Number.POSITIVE_INFINITY });

		act(() => view.result.current.seek(0.5));
		expect(view.result.current.durationMs).toBe(0);
		expect(view.result.current.elapsedMs).toBe(0);
		expect(media.audio.currentTime).toBe(0);
	});

	it("keeps only the most recently requested player playing", async () => {
		const firstMedia = createAudio();
		const secondMedia = createAudio();
		const first = renderPlayer(firstMedia);
		const second = renderPlayer(secondMedia);

		await act(() => first.result.current.togglePlayback());
		await act(() => second.result.current.togglePlayback());

		expect(firstMedia.audio.paused).toBe(true);
		expect(first.result.current.isPlaying).toBe(false);
		expect(secondMedia.audio.paused).toBe(false);
		expect(second.result.current.isPlaying).toBe(true);
	});

	it("cancels pending playback when another player starts and ignores its late completion", async () => {
		const firstMedia = createAudio();
		const finishFirstPlay = delayNextPlay(firstMedia);
		const secondMedia = createAudio();
		const first = renderPlayer(firstMedia);
		const second = renderPlayer(secondMedia);
		let firstPlayPromise: Promise<void> | undefined;
		act(() => {
			firstPlayPromise = first.result.current.togglePlayback();
		});
		expect(first.result.current.isLoading).toBe(true);
		await act(() => second.result.current.togglePlayback());
		await act(async () => {
			finishFirstPlay();
			await firstPlayPromise;
		});

		expect(firstMedia.audio.paused).toBe(true);
		expect(first.result.current.isPlaying).toBe(false);
		expect(first.result.current.isLoading).toBe(false);
		expect(first.result.current.error).toBe("");
		expect(secondMedia.audio.paused).toBe(false);
		expect(second.result.current.isPlaying).toBe(true);
	});

	it("allows a second click to cancel loading without a late start", async () => {
		const media = createAudio();
		const finishPlay = delayNextPlay(media);
		const view = renderPlayer(media);
		let playbackPromise: Promise<void> | undefined;
		act(() => {
			playbackPromise = view.result.current.togglePlayback();
		});
		await act(() => view.result.current.togglePlayback());
		await act(async () => {
			finishPlay();
			await playbackPromise;
		});

		expect(media.play).toHaveBeenCalledTimes(1);
		expect(media.audio.paused).toBe(true);
		expect(view.result.current.isPlaying).toBe(false);
		expect(view.result.current.isLoading).toBe(false);
	});

	it("stops a pending request after unmount even if the browser completes it later", async () => {
		const media = createAudio();
		const finishPlay = delayNextPlay(media);
		const view = renderPlayer(media);
		let playbackPromise: Promise<void> | undefined;
		act(() => {
			playbackPromise = view.result.current.togglePlayback();
		});
		view.unmount();
		expect(media.audio.paused).toBe(true);
		await act(async () => {
			finishPlay();
			await playbackPromise;
		});

		expect(media.audio.paused).toBe(true);
		expect(animationFrames.size).toBe(0);
	});

	it("does not let a queued pause event cancel a newer play on the same element", async () => {
		const media = createAudio();
		const view = renderPlayer(media);
		await act(() => view.result.current.togglePlayback());
		media.pause.mockImplementationOnce(() => {
			media.state.isPaused = true;
		});
		await act(() => view.result.current.togglePlayback());
		await act(() => view.result.current.togglePlayback());
		act(() => media.audio.dispatchEvent(new Event("pause")));

		expect(media.audio.paused).toBe(false);
		expect(view.result.current.isPlaying).toBe(true);
		expect(view.result.current.isLoading).toBe(false);
	});

	it("resets a changed source without letting the old completion stop its new playback", async () => {
		const media = createAudio();
		const finishFirstPlay = delayNextPlay(media);
		const view = renderPlayer(media, { sourceUrl: "first.mp4", durationMs: 8_000 });
		let firstPlayPromise: Promise<void> | undefined;
		act(() => {
			view.result.current.seek(0.5);
			view.result.current.cyclePlaybackRate();
			firstPlayPromise = view.result.current.togglePlayback();
		});
		view.rerender({ sourceUrl: "second.mp4", durationMs: 4_000 });
		expect(view.result.current.isPlaying).toBe(false);
		expect(view.result.current.isLoading).toBe(false);
		expect(view.result.current.elapsedMs).toBe(0);
		expect(view.result.current.playbackRate).toBe(1);
		expect(view.result.current.durationMs).toBe(4_000);

		await act(() => view.result.current.togglePlayback());
		await act(async () => {
			finishFirstPlay();
			await firstPlayPromise;
		});
		expect(media.audio.paused).toBe(false);
		expect(view.result.current.isPlaying).toBe(true);
		expect(view.result.current.error).toBe("");
	});

	it("reflects buffering, pause, end and media errors and replays from the beginning", async () => {
		const media = createAudio();
		const view = renderPlayer(media, { durationMs: 5_000 });
		await act(() => view.result.current.togglePlayback());
		act(() => media.audio.dispatchEvent(new Event("waiting")));
		expect(view.result.current.isLoading).toBe(true);
		act(() => media.audio.dispatchEvent(new Event("playing")));
		expect(view.result.current.isLoading).toBe(false);
		act(() => media.audio.pause());
		expect(view.result.current.isPlaying).toBe(false);

		await act(() => view.result.current.togglePlayback());
		act(() => {
			media.audio.currentTime = 5;
			media.state.isPaused = true;
			media.state.hasEnded = true;
			media.audio.dispatchEvent(new Event("ended"));
		});
		expect(view.result.current.elapsedMs).toBe(5_000);
		expect(view.result.current.isPlaying).toBe(false);
		await act(() => view.result.current.togglePlayback());
		expect(media.audio.currentTime).toBe(0);
		expect(view.result.current.elapsedMs).toBe(0);
		expect(view.result.current.isPlaying).toBe(true);

		act(() => media.audio.dispatchEvent(new Event("error")));
		expect(view.result.current.error).not.toBe("");
		expect(view.result.current.isPlaying).toBe(false);
		expect(view.result.current.isLoading).toBe(false);
	});

	it("cycles playback speed through 1, 1.5 and 2 even across rapid clicks", () => {
		const media = createAudio();
		const view = renderPlayer(media);
		act(() => view.result.current.cyclePlaybackRate());
		expect(view.result.current.playbackRate).toBe(1.5);
		expect(media.audio.playbackRate).toBe(1.5);
		act(() => view.result.current.cyclePlaybackRate());
		expect(view.result.current.playbackRate).toBe(2);
		act(() => view.result.current.cyclePlaybackRate());
		expect(view.result.current.playbackRate).toBe(1);
		act(() => {
			view.result.current.cyclePlaybackRate();
			view.result.current.cyclePlaybackRate();
		});
		expect(view.result.current.playbackRate).toBe(2);
		expect(media.audio.playbackRate).toBe(2);
	});

	it("updates progress while playing and cancels animation work on pause", async () => {
		const media = createAudio();
		const view = renderPlayer(media);
		expect(animationFrames.size).toBe(0);
		await act(() => view.result.current.togglePlayback());
		const [frameId, callback] = [...animationFrames.entries()][0]!;
		animationFrames.delete(frameId);
		act(() => {
			media.audio.currentTime = 0.5;
			callback(100);
		});
		expect(view.result.current.elapsedMs).toBe(500);
		expect(animationFrames.size).toBe(1);
		act(() => media.audio.pause());
		expect(animationFrames.size).toBe(0);
	});
});
