import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageFileCard } from "@/features/chat/components/message-file-card";
import { VoicePlayer } from "@/features/chat/components/voice-player";
import { makeAttachment } from "./factories";

afterEach(() => vi.restoreAllMocks());

describe("attachment components", () => {
	it("renders a downloadable file card with its name and size", () => {
		render(
			<MessageFileCard
				attachment={makeAttachment({
					kind: "file",
					fileName: "Tài liệu.pdf",
					mediaType: "application/pdf",
					byteSize: 2_048,
					width: null,
					height: null,
				})}
			/>,
		);

		const link = screen.getByRole("link", { name: /Tài liệu\.pdf/u });
		expect(link).toHaveAttribute("download", "Tài liệu.pdf");
		expect(screen.getByText("2.0 KB")).toBeInTheDocument();
	});

	it("renders server-derived voice duration without loading audio", () => {
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		render(
			<VoicePlayer
				attachment={makeAttachment({
					kind: "audio",
					mediaType: "audio/mp4",
					durationMs: 65_000,
					waveform: Array.from({ length: 64 }, () => 50),
					width: null,
					height: null,
				})}
			/>,
		);

		expect(screen.getByText("1:05")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Play voice message" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Change playback speed" })).toHaveTextContent("1×");
		expect(screen.getByRole("slider", { name: "Seek voice message" })).toHaveAttribute(
			"aria-valuetext",
			"0:00 of 1:05",
		);
	});
});
