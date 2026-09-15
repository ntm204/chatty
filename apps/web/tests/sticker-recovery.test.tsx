import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { StickerTray } from "@/features/chat/components/sticker-tray";
import { useComposerStickerSend } from "@/features/chat/hooks/use-composer-sticker-send";
import { useStickers } from "@/features/chat/hooks/use-stickers";

vi.mock("@/api/client", () => ({ api: { listStickers: vi.fn(), addSticker: vi.fn(), removeSticker: vi.fn() } }));
vi.mock("@/features/chat/hooks", async () => {
	const actual = await import("@/features/chat/hooks/use-stickers");

	return { useStickers: actual.useStickers };
});

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(api.listStickers).mockResolvedValue([
		{
			id: "sticker",
			width: 128,
			height: 128,
			url: "https://example.test/sticker.png",
			createdAt: "2026-09-15T00:00:00Z",
		},
	]);
});

it("keeps a sticker available when removal fails and blocks duplicate deletes", async () => {
	const { result } = renderHook(useStickers);
	await waitFor(() => expect(result.current.stickers).toHaveLength(1));
	let rejectDelete!: (error: Error) => void;
	vi.mocked(api.removeSticker).mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				rejectDelete = reject;
			}),
	);
	let removal!: Promise<void>;
	act(() => {
		removal = result.current.remove("sticker");
		void result.current.remove("sticker");
	});
	expect(api.removeSticker).toHaveBeenCalledTimes(1);
	expect(result.current.stickers).toHaveLength(1);
	expect(result.current.removingIds.has("sticker")).toBe(true);
	await act(async () => {
		rejectDelete(new Error("Removal failed"));
		await removal;
	});
	expect(result.current.stickers).toHaveLength(1);
	expect(result.current.error).toBe("Removal failed");
	vi.mocked(api.removeSticker).mockResolvedValue(undefined);
	await act(async () => {
		await result.current.remove("sticker");
	});
	expect(result.current.stickers).toHaveLength(0);
});

it("keeps the tray open with a retryable sticker when sending fails", async () => {
	const onPick = vi.fn().mockRejectedValueOnce(new Error("Sticker send interrupted")).mockResolvedValue(undefined);
	const onClose = vi.fn();
	render(<StickerTray onPick={onPick} onClose={onClose} />);
	const send = await screen.findByRole("button", { name: "Send this sticker" });
	fireEvent.click(send);
	await screen.findByRole("alert");
	expect(onClose).not.toHaveBeenCalled();
	expect(screen.getByRole("alert")).toHaveTextContent("Sticker send interrupted");
	fireEvent.click(send);
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	expect(onPick).toHaveBeenCalledTimes(2);
});

it("does not clear the next conversation reply when a previous sticker finishes sending", async () => {
	let finishSend!: () => void;
	const onCancelReply = vi.fn();
	const onSend = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finishSend = resolve;
			}),
	);
	const view = renderHook(() =>
		useComposerStickerSend({ isDisabled: false, replyTo: null, onSend, onCancelReply, stopTyping: vi.fn() }),
	);
	const pending = view.result.current("sticker");
	view.unmount();
	await act(async () => {
		finishSend();
		await pending;
	});
	expect(onCancelReply).not.toHaveBeenCalled();
});
