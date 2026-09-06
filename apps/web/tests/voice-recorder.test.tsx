import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorder } from "@/features/chat/components/voice-recorder";
import type { VoiceRecorderPhase } from "@/features/chat/types/voice-recorder";

const recorder = vi.hoisted(() => ({
	phase: "preview" as VoiceRecorderPhase,
	elapsedMs: 2_500,
	recording: null as Blob | null,
	error: "",
	waveform: [0, 20, 60, 0],
	start: vi.fn(),
	stop: vi.fn(),
	discard: vi.fn(),
}));

const player = vi.hoisted(() => ({
	audioRef: { current: null as HTMLAudioElement | null },
	isPlaying: false,
	isLoading: false,
	elapsedMs: 0,
	durationMs: 2_500,
	error: "",
	seek: vi.fn(),
	togglePlayback: vi.fn(),
}));

vi.mock("@/features/chat/hooks/use-voice-recorder", () => ({ useVoiceRecorder: () => recorder }));
vi.mock("@/features/chat/hooks/use-voice-player", () => ({ useVoicePlayer: () => player }));

beforeEach(() => {
	vi.clearAllMocks();
	recorder.phase = "preview";
	recorder.recording = new Blob(["a real recording"], { type: "audio/webm" });
	player.error = "";
	player.audioRef.current = null;
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
	vi.stubGlobal(
		"URL",
		class extends URL {
			static override createObjectURL = vi.fn(() => "blob:recording-preview");
			static override revokeObjectURL = vi.fn();
		},
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("VoiceRecorder", () => {
	it("keeps the recording after an upload failure and retries the same blob", async () => {
		const onSend = vi.fn().mockRejectedValueOnce(new Error("Upload failed")).mockResolvedValueOnce(undefined);
		const user = userEvent.setup();
		render(<VoiceRecorder isDisabled={false} onSend={onSend} onActiveChange={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Send voice message" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
		expect(recorder.discard).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Send voice message" })).toBeEnabled();

		await user.click(screen.getByRole("button", { name: "Send voice message" }));
		expect(onSend).toHaveBeenCalledTimes(2);
		expect(onSend.mock.calls[0]?.[0]).toBe(recorder.recording);
		expect(onSend.mock.calls[1]?.[0]).toBe(recorder.recording);
		expect(recorder.discard).toHaveBeenCalledTimes(1);
	});

	it("guards immediate duplicate sends and prevents discard during upload", async () => {
		let finishUpload!: () => void;
		const uploadPromise = new Promise<void>((resolve) => {
			finishUpload = resolve;
		});
		const onSend = vi.fn(() => uploadPromise);
		render(<VoiceRecorder isDisabled={false} onSend={onSend} onActiveChange={vi.fn()} />);
		const sendButton = screen.getByRole("button", { name: "Send voice message" });

		act(() => {
			fireEvent.click(sendButton);
			fireEvent.click(sendButton);
			fireEvent.click(screen.getByRole("button", { name: "Discard recording" }));
		});

		expect(onSend).toHaveBeenCalledTimes(1);
		expect(recorder.discard).not.toHaveBeenCalled();
		expect(sendButton).toBeDisabled();
		expect(screen.getByRole("button", { name: "Discard recording" })).toBeDisabled();
		await act(async () => {
			finishUpload();
			await uploadPromise;
		});
		await waitFor(() => expect(recorder.discard).toHaveBeenCalledTimes(1));
	});

	it("does not send a retained recording when the conversation becomes unavailable", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<VoiceRecorder isDisabled onSend={onSend} onActiveChange={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Send voice message" }));
		expect(onSend).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Discard recording" })).toBeEnabled();
	});

	it("treats the permission prompt as an active recording flow with a cancel action", async () => {
		recorder.phase = "requesting";
		recorder.recording = null;
		const onActiveChange = vi.fn();
		render(<VoiceRecorder isDisabled={false} onSend={vi.fn()} onActiveChange={onActiveChange} />);

		expect(onActiveChange).toHaveBeenCalledWith(true);
		expect(screen.getByRole("status")).toHaveTextContent("Waiting for microphone");
		expect(screen.queryByRole("button", { name: "Record a voice message" })).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
		expect(recorder.discard).toHaveBeenCalledTimes(1);
	});

	it("surfaces a playback failure beside the retained preview", () => {
		player.error = "The recording could not be played";
		render(<VoiceRecorder isDisabled={false} onSend={vi.fn()} onActiveChange={vi.fn()} />);

		expect(screen.getByRole("alert")).toHaveTextContent("The recording could not be played");
		expect(screen.getByRole("button", { name: "Discard recording" })).toBeEnabled();
	});
});
