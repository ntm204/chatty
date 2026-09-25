import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useConversationList } from "@/features/chat/hooks/use-conversation-list";
import { makeConversation, makeMessage } from "./factories";

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => void>() }));
vi.mock("@/api/client", () => ({ api: { listConversations: vi.fn(), getConversation: vi.fn() } }));
vi.mock("@/lib/local-chat-store", () => ({
	readConversationPage: vi.fn().mockResolvedValue(null),
	cacheConversationPage: vi.fn().mockResolvedValue(undefined),
	retractCachedMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
}));

beforeEach(() => {
	handlers.clear();
	vi.mocked(api.listConversations).mockReset().mockResolvedValue({ items: [], hasMore: false });
	vi.mocked(api.getConversation).mockReset();
});

it("exposes a failed initial load and a deliberate retry without fabricating an empty success", async () => {
	vi.mocked(api.listConversations).mockRejectedValueOnce(new Error("Unavailable"));
	const { result } = renderHook(() => useConversationList("me", vi.fn()));
	await waitFor(() => expect(result.current.paging.error).toContain("Could not refresh"));
	expect(result.current.paging.isLoading).toBe(false);
	vi.mocked(api.listConversations).mockResolvedValue({ items: [makeConversation()], hasMore: false });
	act(() => result.current.paging.retry());
	await waitFor(() => expect(result.current.conversations).toHaveLength(1));
	expect(result.current.paging.error).toBe("");
});

it("does not let an older refresh overwrite a newer successful refresh", async () => {
	let resolveOld!: (page: Awaited<ReturnType<typeof api.listConversations>>) => void;
	vi.mocked(api.listConversations).mockReturnValueOnce(
		new Promise((resolve) => {
			resolveOld = resolve;
		}),
	);
	const { result } = renderHook(() => useConversationList("me", vi.fn()));
	await waitFor(() => expect(api.listConversations).toHaveBeenCalledOnce());
	vi.mocked(api.listConversations).mockResolvedValue({ items: [makeConversation({ id: "new" })], hasMore: false });
	act(() => result.current.refresh());
	await waitFor(() => expect(result.current.conversations[0]?.id).toBe("new"));
	await act(async () => resolveOld({ items: [makeConversation({ id: "old" })], hasMore: true }));
	expect(result.current.conversations[0]?.id).toBe("new");
	expect(result.current.paging.hasMore).toBe(false);
});

it("does not put a delayed active page into the archived list", async () => {
	let resolveActive!: (page: Awaited<ReturnType<typeof api.listConversations>>) => void;
	vi.mocked(api.listConversations).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				resolveActive = resolve;
			}),
	);
	const view = renderHook(() => useConversationList("me", vi.fn()));
	await waitFor(() => expect(api.listConversations).toHaveBeenCalledWith(false));
	const archived = makeConversation({ id: "archived", isArchived: true });
	vi.mocked(api.listConversations).mockResolvedValue({ items: [archived], hasMore: false });
	act(() => view.result.current.setIsShowingArchived(true));
	await waitFor(() => expect(view.result.current.conversations[0]?.id).toBe("archived"));
	await act(async () => {
		resolveActive({ items: [makeConversation({ id: "active" })], hasMore: true });
	});
	expect(view.result.current.conversations.map((conversation) => conversation.id)).toEqual(["archived"]);
});

it("coalesces unseen-thread lookups and keeps archived messages out of the active sidebar", async () => {
	let resolveRow!: (row: ReturnType<typeof makeConversation>) => void;
	vi.mocked(api.getConversation).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				resolveRow = resolve;
			}),
	);
	const view = renderHook(() => useConversationList("me", vi.fn()));
	await waitFor(() => expect(api.listConversations).toHaveBeenCalled());
	act(() => {
		handlers.get("message:new")?.(makeMessage("first", "peer", "first"));
		handlers.get("message:new")?.(makeMessage("second", "peer", "second"));
	});
	expect(api.getConversation).toHaveBeenCalledTimes(1);
	await act(async () => {
		resolveRow(makeConversation({ isArchived: true }));
	});
	expect(view.result.current.conversations).toEqual([]);
});
