import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useReplyTarget } from "@/features/chat/hooks/use-reply-target";
import { makeMessage } from "./factories";

vi.mock("@/api/client", () => ({ api: { getMessageContext: vi.fn() } }));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({ useSocketEvent: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("restores a reply outside the loaded window without replacing that window", async () => {
	const target = makeMessage("old", "an", "Old question");
	vi.mocked(api.getMessageContext).mockResolvedValue({
		messages: [target],
		hasMoreOlder: false,
		hasMoreNewer: true,
	});
	const { result } = renderHook(() => useReplyTarget([], "conversation-1"));
	await act(async () => result.current.requestReplyTo(target.id));
	expect(result.current.replyTo).toEqual(target);
	expect(result.current.pendingReplyId).toBeNull();
});

it("retains an unavailable reply id until deliberate retry or removal", async () => {
	vi.mocked(api.getMessageContext).mockRejectedValue(new Error("Offline"));
	const { result } = renderHook(() => useReplyTarget([], "conversation-1"));
	await act(async () => result.current.requestReplyTo("old"));
	expect(result.current.pendingReplyId).toBe("old");
	expect(result.current.replyError).toContain("Try again");
	act(() => result.current.clearReply());
	expect(result.current.pendingReplyId).toBeNull();
	expect(result.current.replyError).toBe("");
});

it("ignores an old lookup after changing conversation or choosing another reply", async () => {
	let resolve!: (value: Awaited<ReturnType<typeof api.getMessageContext>>) => void;
	vi.mocked(api.getMessageContext).mockReturnValue(
		new Promise((done) => {
			resolve = done;
		}),
	);
	const { result, rerender } = renderHook(({ id }) => useReplyTarget([], id), { initialProps: { id: "first" } });
	act(() => {
		void result.current.requestReplyTo("old");
	});
	rerender({ id: "second" });
	const next = makeMessage("next", "an", "New question");
	act(() => result.current.setReplyTo(next));
	await act(async () =>
		resolve({
			messages: [makeMessage("old", "an", "Old")],
			hasMoreOlder: false,
			hasMoreNewer: true,
		}),
	);
	await waitFor(() => expect(result.current.replyTo).toEqual(next));
});
