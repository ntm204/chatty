import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePlayer } from "@/features/chat/components/voice-player";
import { VoiceWaveform } from "@/features/chat/components/voice-waveform";
import { makeAttachment } from "./factories";
const state = vi.hoisted(() => ({ isPlaying: false }));
vi.mock("@/features/chat/hooks/use-voice-player", () => ({
	useVoicePlayer: () => ({
		audioRef: { current: null },
		...state,
		isLoading: false,
		error: "",
		elapsedMs: 0,
		durationMs: 2000,
		playbackRate: 1,
		togglePlayback: vi.fn(),
		cyclePlaybackRate: vi.fn(),
		seek: vi.fn(),
	}),
}));
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	state.isPlaying = false;
});
it("only exposes speed while playing and keeps duration available initially", () => {
	const attachment = makeAttachment();
	const { rerender } = render(<VoicePlayer attachment={attachment} />);
	expect(screen.getByText("0:02")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Change playback speed" })).toBeNull();
	state.isPlaying = true;
	rerender(<VoicePlayer attachment={attachment} />);
	expect(screen.getByRole("button", { name: "Change playback speed" })).toHaveAttribute("tabindex", "0");
	state.isPlaying = false;
	rerender(<VoicePlayer attachment={attachment} />);
	expect(screen.queryByRole("button", { name: "Change playback speed" })).toBeNull();
});
it.each([1, 1.25, 1.5, 1.75, 2])("aligns equal-width bars to physical pixels at scale %s", (ratio) => {
	vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(ratio);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 10.3, width: 143.5 } as DOMRect);
	const { container } = render(<VoiceWaveform waveform={[30, 80, 40]} barCount={28} />);
	const bars = [...container.querySelectorAll("span")];
	const widths = bars.map((bar) => parseFloat(bar.style.width) * ratio);
	expect(new Set(widths).size).toBe(1);
	for (const bar of bars) {
		const physicalLeft = (parseFloat(bar.style.left) + 10.3) * ratio;
		expect(physicalLeft).toBeCloseTo(Math.round(physicalLeft), 8);
	}
});
