import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MessageSearchPageDTO } from "@chatty/shared-types";
import { api } from "@/api/client";
import { useMessageSearch } from "@/features/chat/hooks/use-message-search";
import { makeMessage } from "./factories";

type Handler = (event: unknown) => void;
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (event: string, handler: Handler) => handlers.set(event, handler),
}));

function result(id: string) {
	return {
		message: makeMessage(id, "an", id),
		conversation: { id: "conversation-1", isGroup: false, name: null, participants: [] },
	};
}
beforeEach(() => {
	vi.useFakeTimers();
	handlers.clear();
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it("discards a pagination response from an earlier query", async () => {
	let finishOldPage!: (page: MessageSearchPageDTO) => void;
	vi.spyOn(api, "searchMessages")
		.mockResolvedValueOnce({ results: [result("first")], hasMore: true })
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishOldPage = resolve;
				}),
		)
		.mockResolvedValueOnce({ results: [result("new query")], hasMore: false });
	const view = renderHook(() => useMessageSearch());
	act(() => view.result.current.setQuery("first"));
	await act(() => vi.advanceTimersByTimeAsync(500));
	act(() => view.result.current.loadMore());
	act(() => view.result.current.setQuery("second"));
	await act(() => vi.advanceTimersByTimeAsync(500));
	await act(async () => finishOldPage({ results: [result("stale")], hasMore: true }));
	expect(view.result.current.results.map((found) => found.message.id)).toEqual(["new query"]);
	expect(view.result.current.hasMore).toBe(false);
	expect(view.result.current.isLoadingMore).toBe(false);
});

it("reports a failed page and retries without losing the existing results", async () => {
	vi.spyOn(api, "searchMessages")
		.mockResolvedValueOnce({ results: [result("first")], hasMore: true })
		.mockRejectedValueOnce(new Error("Offline"))
		.mockResolvedValueOnce({ results: [result("second")], hasMore: false });
	const view = renderHook(() => useMessageSearch("conversation-1"));
	act(() => view.result.current.setQuery("query"));
	await act(() => vi.advanceTimersByTimeAsync(500));
	await act(async () => view.result.current.loadMore());
	expect(view.result.current.error).toBe("Offline");
	expect(view.result.current.results).toHaveLength(1);
	await act(async () => view.result.current.retry());
	expect(view.result.current.results).toHaveLength(2);
	expect(api.searchMessages).toHaveBeenLastCalledWith(
		"query",
		20,
		"conversation-1",
		result("first").message.createdAt,
		"first",
	);
	expect(view.result.current.error).toBe("");
	act(() => view.result.current.setQuery(""));
	expect(view.result.current.results).toEqual([]);
	expect(view.result.current.hasMore).toBe(false);
	expect(view.result.current.isSearching).toBe(false);
});

it("does not revive a retracted result from a response already in flight", async () => {
	let finish!: (page: MessageSearchPageDTO) => void;
	vi.spyOn(api, "searchMessages").mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const view = renderHook(() => useMessageSearch());
	act(() => view.result.current.setQuery("secret"));
	await act(() => vi.advanceTimersByTimeAsync(500));
	act(() =>
		handlers.get("message:updated")?.({ ...makeMessage("secret", "an", ""), deletedAt: new Date().toISOString() }),
	);
	await act(async () => finish({ results: [result("secret")], hasMore: false }));
	expect(view.result.current.results).toEqual([]);
	expect(api.searchMessages).toHaveBeenCalledWith("secret", 20, undefined);
});

it("keeps the pagination cursor offline even when all loaded results are hidden", async () => {
	const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
	const search = vi
		.spyOn(api, "searchMessages")
		.mockResolvedValueOnce({ results: [result("first")], hasMore: true })
		.mockResolvedValueOnce({ results: [result("second")], hasMore: false });
	const view = renderHook(() => useMessageSearch("conversation-1"));
	act(() => view.result.current.setQuery("query"));
	await act(() => vi.advanceTimersByTimeAsync(500));
	online.mockReturnValue(false);
	act(() => view.result.current.loadMore());
	expect(search).toHaveBeenCalledTimes(1);
	expect(view.result.current.error).toContain("Connect to load more");
	expect(view.result.current.results).toHaveLength(1);
	act(() => handlers.get("message:hidden")?.({ conversationId: "conversation-1", messageId: "first" }));
	expect(view.result.current.hasNoResults).toBe(false);
	online.mockReturnValue(true);
	await act(async () => {
		view.result.current.retry();
		view.result.current.retry();
	});
	expect(search).toHaveBeenCalledTimes(2);
	expect(search).toHaveBeenLastCalledWith("query", 20, "conversation-1", result("first").message.createdAt, "first");
	expect(view.result.current.results.map((found) => found.message.id)).toEqual(["second"]);
	expect(view.result.current.error).toBe("");
});
