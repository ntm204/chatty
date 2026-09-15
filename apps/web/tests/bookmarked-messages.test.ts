import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { SavedMessagePageDTO } from "@chatty/shared-types";
import { api } from "@/api/client";
import { useBookmarkedMessages } from "@/features/chat/hooks/use-bookmarked-messages";
import { makeMessage } from "./factories";

type Handler = (event: unknown) => void;
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (event: string, handler: Handler) => handlers.set(event, handler),
}));
vi.mock("@/api/client", () => ({ api: { listBookmarkedMessages: vi.fn(), removeBookmark: vi.fn() } }));
function result(id: string) {
	return {
		message: makeMessage(id, "me", id),
		conversation: { id: "conversation-1", isGroup: false, name: null, participants: [] },
	};
}
beforeEach(() => {
	vi.resetAllMocks();
	handlers.clear();
});

it("does not resurrect an in-flight page after retraction", async () => {
	let finish!: (page: SavedMessagePageDTO) => void;
	vi.mocked(api.listBookmarkedMessages)
		.mockResolvedValueOnce({ results: [result("first")], hasMore: true })
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		)
		.mockResolvedValueOnce({ results: [], hasMore: false });
	const { result: state } = renderHook(() => useBookmarkedMessages("me"));
	await waitFor(() => expect(state.current.results).toHaveLength(1));
	act(() => state.current.loadMore());
	act(() =>
		handlers.get("message:updated")?.({ ...makeMessage("first", "me", ""), deletedAt: "2026-09-15T00:00:00Z" }),
	);
	await waitFor(() => expect(state.current.isLoading).toBe(false));
	await act(async () => {
		finish({ results: [result("first")], hasMore: false });
	});
	expect(state.current.results).toEqual([]);
});

it("retains a bookmark on failed removal and coalesces duplicate clicks", async () => {
	vi.mocked(api.listBookmarkedMessages).mockResolvedValue({ results: [result("first")], hasMore: false });
	let reject!: (error: Error) => void;
	vi.mocked(api.removeBookmark).mockImplementationOnce(
		() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
	);
	const { result: state } = renderHook(() => useBookmarkedMessages("me"));
	await waitFor(() => expect(state.current.results).toHaveLength(1));
	let removal!: Promise<void>;
	act(() => {
		removal = state.current.remove(result("first"));
		void state.current.remove(result("first"));
	});
	expect(api.removeBookmark).toHaveBeenCalledTimes(1);
	await act(async () => {
		reject(new Error("Removal interrupted"));
		await removal;
	});
	expect(state.current.results).toHaveLength(1);
	expect(state.current.error).toBe("Removal interrupted");
	expect(state.current.removingId).toBeNull();
});

it("clears visible results immediately on loss of membership", async () => {
	vi.mocked(api.listBookmarkedMessages)
		.mockResolvedValueOnce({ results: [result("first")], hasMore: false })
		.mockRejectedValueOnce(new Error("Offline"));
	const { result: state } = renderHook(() => useBookmarkedMessages("me"));
	await waitFor(() => expect(state.current.results).toHaveLength(1));
	act(() => handlers.get("conversation:left")?.({ conversationId: "conversation-1" }));
	expect(state.current.results).toEqual([]);
	await waitFor(() => expect(state.current.error).toBe("Offline"));
});
