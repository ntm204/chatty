import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/api/client";
import { useSessionMessageSends } from "@/features/chat/hooks/use-session-message-sends";
import { makeCurrentUser, makeMessage } from "./factories";

vi.mock("@/api/client", () => ({ api: { sendFile: vi.fn(), sendVoice: vi.fn(), sendSticker: vi.fn() } }));

beforeEach(() => {
	vi.resetAllMocks();
	useAuth.setState({ currentUser: makeCurrentUser({ id: "me" }) });
});

describe("session media send identities", () => {
	it("coalesces concurrent file sends and reuses its key after a lost response", async () => {
		let rejectSend!: (error: Error) => void;
		vi.mocked(api.sendFile).mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectSend = reject;
				}),
		);
		const { result } = renderHook(() => useSessionMessageSends("thread", "me"));
		const file = new File(["report"], "report.txt");
		const first = result.current.sendFile(file, "", null);
		const duplicate = result.current.sendFile(file, "", null);
		expect(duplicate).toBe(first);
		await Promise.resolve();
		expect(api.sendFile).toHaveBeenCalledTimes(1);
		const firstKey = vi.mocked(api.sendFile).mock.calls[0]![5];
		rejectSend(new Error("Response lost"));
		await expect(first).rejects.toThrow("Response lost");
		vi.mocked(api.sendFile).mockResolvedValue(makeMessage("stored", "me", ""));
		await result.current.sendFile(file, "", null);
		expect(vi.mocked(api.sendFile).mock.calls[1]![5]).toBe(firstKey);
		await result.current.sendFile(file, "", null);
		expect(vi.mocked(api.sendFile).mock.calls[2]![5]).not.toBe(firstKey);
	});

	it("keeps a voice retry key but separates new recordings and destinations", async () => {
		vi.mocked(api.sendVoice)
			.mockRejectedValueOnce(new Error("Offline"))
			.mockResolvedValue(makeMessage("voice", "me", ""));
		const view = renderHook(({ conversation }) => useSessionMessageSends(conversation, "me"), {
			initialProps: { conversation: "one" },
		});
		const recording = new Blob(["audio"]);
		await expect(view.result.current.sendVoice(recording)).rejects.toThrow("Offline");
		const key = vi.mocked(api.sendVoice).mock.calls[0]![3];
		await view.result.current.sendVoice(recording);
		expect(vi.mocked(api.sendVoice).mock.calls[1]![3]).toBe(key);
		view.rerender({ conversation: "two" });
		await view.result.current.sendVoice(recording);
		expect(vi.mocked(api.sendVoice).mock.calls[2]![3]).not.toBe(key);
		await view.result.current.sendVoice(new Blob(["audio"]));
		expect(vi.mocked(api.sendVoice).mock.calls[3]![3]).not.toBe(vi.mocked(api.sendVoice).mock.calls[2]![3]);
	});

	it("retries a sticker without duplicating it and lets a confirmed sticker be sent again", async () => {
		vi.mocked(api.sendSticker)
			.mockRejectedValueOnce(new Error("Offline"))
			.mockResolvedValue(makeMessage("sticker", "me", ""));
		const { result } = renderHook(() => useSessionMessageSends("thread", "me"));
		await expect(result.current.sendSticker("sticker", null)).rejects.toThrow("Offline");
		await result.current.sendSticker("sticker", null);
		await result.current.sendSticker("sticker", null);
		const calls = vi.mocked(api.sendSticker).mock.calls;
		expect(calls[0]![3]).toBeTruthy();
		expect(calls[1]![3]).toBe(calls[0]![3]);
		expect(calls[2]![3]).not.toBe(calls[0]![3]);
	});
	it("does not dispatch a deferred upload after logout", async () => {
		const { result } = renderHook(() => useSessionMessageSends("thread", "me"));
		const pending = result.current.sendVoice(new Blob(["audio"]));
		useAuth.setState({ currentUser: null });
		await expect(pending).rejects.toThrow("account session changed");
		expect(api.sendVoice).not.toHaveBeenCalled();
	});
});
