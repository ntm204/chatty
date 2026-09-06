import type { MessageDTO, ServerToClientEvents } from "@chatty/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { MESSAGE_PAGE_SIZE } from "@/features/chat/constants/pagination";
import { useConversationMessages } from "@/features/chat/hooks/use-conversation-messages";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, makeMessage } from "./factories";

type SocketHandler = (payload: unknown) => void;
const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, SocketHandler>() }));
const localStore = vi.hoisted(() => ({
	cacheMessageSnapshot: vi.fn(),
	enqueueLocalMessage: vi.fn(),
	readLocalOutbox: vi.fn(),
	readMessageSnapshot: vi.fn(),
	removeLocalMessage: vi.fn(),
}));

vi.mock("@/api/client", () => ({
	api: { listMessages: vi.fn(), getMessageContext: vi.fn(), sendMessage: vi.fn() },
}));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => socketHandlers.set(eventName, handler),
}));
vi.mock("@/features/chat/hooks/use-message-actions", () => ({
	useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), toggleReaction: vi.fn() }),
}));
vi.mock("@/lib/local-chat-store", () => localStore);

interface Deferred<Value> {
	promise: Promise<Value>;
	resolve: (value: Value) => void;
	reject: (error: Error) => void;
}

function createDeferred<Value>(): Deferred<Value> {
	let resolve: (value: Value) => void = () => undefined;
	let reject: (error: Error) => void = () => undefined;
	const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

function makeHistoryMessage(index: number, conversationId = "conversation"): MessageDTO {
	return {
		...makeMessage(`message-${index}`, "an", `Message ${index}`, [], {
			createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
		}),
		conversationId,
	};
}

function emit<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	payload: Parameters<ServerToClientEvents[EventName]>[0],
): void {
	act(() => socketHandlers.get(eventName)?.(payload));
}

beforeEach(() => {
	socketHandlers.clear();
	vi.mocked(api.listMessages)
		.mockReset()
		.mockResolvedValue([makeHistoryMessage(100)]);
	vi.mocked(api.getMessageContext)
		.mockReset()
		.mockResolvedValue({ messages: [makeHistoryMessage(10)], hasMoreOlder: true, hasMoreNewer: true });
	vi.mocked(api.sendMessage).mockReset();
	localStore.cacheMessageSnapshot.mockReset().mockResolvedValue(undefined);
	localStore.enqueueLocalMessage.mockReset().mockResolvedValue(undefined);
	localStore.readLocalOutbox.mockReset().mockResolvedValue([]);
	localStore.readMessageSnapshot.mockReset().mockResolvedValue([]);
	localStore.removeLocalMessage.mockReset().mockResolvedValue(undefined);
	useAuth.setState({ currentUser: makeCurrentUser() });
});

describe("history navigation", () => {
	it.each(["loadOlder", "loadNewer"] as const)(
		"ignores an outstanding %s page after returning to latest",
		async (loadPage) => {
			const stalePage = createDeferred<MessageDTO[]>();
			const latestPage = createDeferred<MessageDTO[]>();
			const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
				initialProps: { target: "message-10" as string | null },
			});
			await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
			vi.mocked(api.listMessages).mockReturnValueOnce(stalePage.promise).mockReturnValueOnce(latestPage.promise);

			act(() => view.result.current[loadPage]());
			view.rerender({ target: null });
			expect(view.result.current.isLoadingThread).toBe(true);
			expect(view.result.current.targetMessageId).toBeNull();
			expect(view.result.current.isLoadingOlder).toBe(false);
			expect(view.result.current.isLoadingNewer).toBe(false);
			await act(async () => latestPage.resolve([makeHistoryMessage(100)]));
			await act(async () => stalePage.resolve([makeHistoryMessage(1)]));

			expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100"]);
			expect(view.result.current.hasMoreNewer).toBe(false);
			expect(view.result.current.hasMoreOlder).toBe(false);
			expect(view.result.current.isLoadingThread).toBe(false);
		},
	);

	it.each(["loadOlder", "loadNewer"] as const)(
		"does not let the previous conversation's %s completion reset the current request",
		async (loadPage) => {
			const stalePage = createDeferred<MessageDTO[]>();
			const currentPage = createDeferred<MessageDTO[]>();
			const view = renderHook(
				({ conversation }) => useConversationMessages(conversation, vi.fn(), "message-10"),
				{
					initialProps: { conversation: "conversation" },
				},
			);
			await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
			vi.mocked(api.listMessages).mockReturnValueOnce(stalePage.promise).mockReturnValueOnce(currentPage.promise);
			act(() => view.result.current[loadPage]());
			vi.mocked(api.getMessageContext).mockResolvedValueOnce({
				messages: [makeHistoryMessage(10, "other")],
				hasMoreOlder: true,
				hasMoreNewer: true,
			});
			view.rerender({ conversation: "other" });
			await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
			act(() => view.result.current[loadPage]());
			await act(async () => stalePage.resolve([makeHistoryMessage(1)]));

			expect(view.result.current[loadPage === "loadOlder" ? "isLoadingOlder" : "isLoadingNewer"]).toBe(true);
			expect(view.result.current.messages.every((message) => message.conversationId === "other")).toBe(true);
			await act(async () => currentPage.resolve([]));
		},
	);

	it("does not apply a stale reconnect response after opening a history result", async () => {
		const reconnectPage = createDeferred<MessageDTO[]>();
		const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
			initialProps: { target: null as string | null },
		});
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		vi.mocked(api.listMessages).mockReturnValueOnce(reconnectPage.promise);
		act(() => view.result.current.resync());
		view.rerender({ target: "message-10" });
		await waitFor(() => expect(view.result.current.targetMessageId).toBe("message-10"));
		await act(async () => reconnectPage.resolve([makeHistoryMessage(101)]));

		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-10"]);
		expect(view.result.current.hasMoreNewer).toBe(true);
	});

	it("keeps live arrivals received while a reconnect request is pending", async () => {
		const reconnectPage = createDeferred<MessageDTO[]>();
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		vi.mocked(api.listMessages).mockReturnValueOnce(reconnectPage.promise);
		act(() => view.result.current.resync());
		emit("message:new", makeHistoryMessage(101));
		await act(async () => reconnectPage.resolve([makeHistoryMessage(100)]));

		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100", "message-101"]);
	});

	it("pages through the unloaded gap when live and own messages arrive beyond it", async () => {
		const ownMessage = { ...makeHistoryMessage(101), author: makeCurrentUser() };
		vi.mocked(api.sendMessage).mockResolvedValue(ownMessage);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn(), "message-10"));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		emit("message:new", makeHistoryMessage(100));
		await act(async () => view.result.current.sendMessage("hello", [], null));
		const middlePage = Array.from({ length: MESSAGE_PAGE_SIZE }, (_, index) => makeHistoryMessage(index + 11));
		vi.mocked(api.listMessages).mockResolvedValueOnce(middlePage);
		act(() => view.result.current.loadNewer());
		await waitFor(() => expect(view.result.current.isLoadingNewer).toBe(false));

		expect(api.listMessages).toHaveBeenLastCalledWith("conversation", {
			limit: MESSAGE_PAGE_SIZE,
			after: "message-10",
		});
		expect(view.result.current.messages.map((message) => message.id)).toEqual([
			"message-10",
			...middlePage.map((message) => message.id),
			"message-100",
			"message-101",
		]);

		vi.mocked(api.listMessages).mockResolvedValueOnce([makeHistoryMessage(100), ownMessage]);
		act(() => view.result.current.loadNewer());
		await waitFor(() => expect(view.result.current.hasMoreNewer).toBe(false));
		expect(api.listMessages).toHaveBeenLastCalledWith("conversation", {
			limit: MESSAGE_PAGE_SIZE,
			after: middlePage[middlePage.length - 1]!.id,
		});
		expect(view.result.current.messages.filter((message) => message.id === "message-100")).toHaveLength(1);
		expect(view.result.current.messages.filter((message) => message.id === "message-101")).toHaveLength(1);
	});

	it("reports a failed return to latest despite cached messages and supports repeated retry", async () => {
		localStore.readMessageSnapshot.mockResolvedValue([makeHistoryMessage(10)]);
		const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
			initialProps: { target: "message-10" as string | null },
		});
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		vi.mocked(api.listMessages).mockRejectedValue(new Error("Could not reach the server"));
		view.rerender({ target: null });
		await waitFor(() => expect(view.result.current.loadError).toBe("Could not reach the server"));
		expect(view.result.current.targetMessageId).toBeNull();
		expect(view.result.current.hasMoreNewer).toBe(false);

		act(() => view.result.current.retryLoad());
		await waitFor(() => expect(view.result.current.loadError).toBe("Could not reach the server"));
		vi.mocked(api.listMessages).mockResolvedValue([makeHistoryMessage(100)]);
		act(() => view.result.current.retryLoad());
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		expect(view.result.current.loadError).toBe("");
		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100"]);
	});

	it.each(["cache-first", "server-first"] as const)(
		"keeps arrivals while returning to latest when the responses settle %s",
		async (order) => {
			const cachedPage = createDeferred<MessageDTO[]>();
			const latestPage = createDeferred<MessageDTO[]>();
			const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
				initialProps: { target: "message-10" as string | null },
			});
			await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
			localStore.readMessageSnapshot.mockReturnValueOnce(cachedPage.promise);
			vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
			view.rerender({ target: null });
			emit("message:new", makeHistoryMessage(101));

			if (order === "cache-first") {
				await act(async () => cachedPage.resolve([makeHistoryMessage(10)]));
				await act(async () => latestPage.resolve([makeHistoryMessage(100)]));
			} else {
				await act(async () => latestPage.resolve([makeHistoryMessage(100)]));
				await act(async () => cachedPage.resolve([makeHistoryMessage(10)]));
			}

			expect(view.result.current.isLoadingThread).toBe(false);
			expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100", "message-101"]);
		},
	);

	it("keeps an own send response received before the return-to-latest page", async () => {
		const latestPage = createDeferred<MessageDTO[]>();
		const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
			initialProps: { target: "message-10" as string | null },
		});
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
		vi.mocked(api.sendMessage).mockResolvedValue({ ...makeHistoryMessage(101), author: makeCurrentUser() });
		view.rerender({ target: null });
		await act(async () => view.result.current.sendMessage("hello", [], null));
		await act(async () => latestPage.resolve([makeHistoryMessage(100)]));

		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100", "message-101"]);
	});

	it.each(["edited", "deleted"] as const)(
		"keeps an arrival's %s version when stale cache and latest responses contain the same message",
		async (change) => {
			const cachedPage = createDeferred<MessageDTO[]>();
			const latestPage = createDeferred<MessageDTO[]>();
			const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
				initialProps: { target: "message-10" as string | null },
			});
			await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
			localStore.readMessageSnapshot.mockReturnValueOnce(cachedPage.promise);
			vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
			view.rerender({ target: null });
			const original = makeHistoryMessage(101);
			const updated = {
				...original,
				content: change === "deleted" ? "" : "Corrected text",
				editedAt: change === "edited" ? "2026-09-01T10:00:00.000Z" : null,
				deletedAt: change === "deleted" ? "2026-09-01T10:00:00.000Z" : null,
			};
			emit("message:new", original);
			emit("message:updated", updated);
			await act(async () => cachedPage.resolve([original]));
			expect(view.result.current.messages).toEqual([updated]);
			await act(async () => latestPage.resolve([original, makeHistoryMessage(100)]));

			expect(view.result.current.messages).toEqual([makeHistoryMessage(100), updated]);
		},
	);

	it("does not resurrect a hidden arrival from the buffer, cache, or latest response", async () => {
		const cachedPage = createDeferred<MessageDTO[]>();
		const latestPage = createDeferred<MessageDTO[]>();
		const view = renderHook(({ target }) => useConversationMessages("conversation", vi.fn(), target), {
			initialProps: { target: "message-10" as string | null },
		});
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		localStore.readMessageSnapshot.mockReturnValueOnce(cachedPage.promise);
		vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
		view.rerender({ target: null });
		emit("message:new", makeHistoryMessage(101));
		emit("message:hidden", { conversationId: "conversation", messageId: "message-101" });
		await act(async () => cachedPage.resolve([makeHistoryMessage(101)]));
		expect(view.result.current.messages).toEqual([]);
		await act(async () => latestPage.resolve([makeHistoryMessage(101), makeHistoryMessage(100)]));

		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100"]);
	});

	it("prefers the buffered arrival over an older version returned by cache and latest", async () => {
		const cachedPage = createDeferred<MessageDTO[]>();
		const latestPage = createDeferred<MessageDTO[]>();
		localStore.readMessageSnapshot.mockReturnValueOnce(cachedPage.promise);
		vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		const arrived = { ...makeHistoryMessage(101), content: "Newest event version" };
		emit("message:new", arrived);
		await act(async () => cachedPage.resolve([makeHistoryMessage(101)]));
		expect(view.result.current.messages).toEqual([arrived]);
		await act(async () => latestPage.resolve([makeHistoryMessage(101)]));

		expect(view.result.current.messages).toEqual([arrived]);
	});

	it("applies updates to a pending page without pulling unrelated history into the window", async () => {
		const latestPage = createDeferred<MessageDTO[]>();
		vi.mocked(api.listMessages).mockReturnValueOnce(latestPage.promise);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		const updated = { ...makeHistoryMessage(100), content: "Corrected while loading" };
		emit("message:updated", updated);
		emit("message:updated", { ...makeHistoryMessage(1), content: "Edited outside this page" });
		emit("message:hidden", { conversationId: "conversation", messageId: "message-99" });
		await act(async () => latestPage.resolve([makeHistoryMessage(100), makeHistoryMessage(99)]));

		expect(view.result.current.messages).toEqual([updated]);
	});

	it("reports a missing history target despite a valid cached latest page", async () => {
		localStore.readMessageSnapshot.mockResolvedValue([makeHistoryMessage(100)]);
		vi.mocked(api.getMessageContext).mockRejectedValue(new Error("Message no longer exists"));
		const view = renderHook(() => useConversationMessages("conversation", vi.fn(), "removed-message"));

		await waitFor(() => expect(view.result.current.loadError).toBe("Message no longer exists"));
		expect(view.result.current.isLoadingThread).toBe(false);
		expect(view.result.current.targetMessageId).toBeNull();
	});

	it("still opens a cached conversation offline when no history navigation was requested", async () => {
		localStore.readMessageSnapshot.mockResolvedValue([makeHistoryMessage(100)]);
		vi.mocked(api.listMessages).mockRejectedValue(new Error("offline"));
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));

		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		expect(view.result.current.loadError).toBe("");
		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-100"]);
	});

	it("does not append an own send response into a conversation opened while it was pending", async () => {
		const sentMessage = createDeferred<MessageDTO>();
		vi.mocked(api.sendMessage).mockReturnValue(sentMessage.promise);
		const view = renderHook(({ conversation }) => useConversationMessages(conversation, vi.fn()), {
			initialProps: { conversation: "conversation" },
		});
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		act(() => void view.result.current.sendMessage("hello", [], null));
		await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());
		vi.mocked(api.listMessages).mockResolvedValue([makeHistoryMessage(200, "other")]);
		view.rerender({ conversation: "other" });
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		await act(async () => sentMessage.resolve({ ...makeHistoryMessage(101), author: makeCurrentUser() }));

		expect(view.result.current.messages.map((message) => message.id)).toEqual(["message-200"]);
	});
});
