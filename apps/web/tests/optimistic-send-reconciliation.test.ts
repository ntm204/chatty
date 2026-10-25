import type { MessageDTO, ServerToClientEvents } from "@chatty/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
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
	api: {
		listMessages: vi.fn(),
		sendMessage: vi.fn(),
		hideMessage: vi.fn(),
	},
}));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => socketHandlers.set(eventName, handler),
}));
vi.mock("@/features/chat/hooks/use-message-actions", () => ({
	useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), toggleReaction: vi.fn() }),
}));
vi.mock("@/lib/local-chat-store", () => localStore);

function emit<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	payload: Parameters<ServerToClientEvents[EventName]>[0],
): void {
	act(() => socketHandlers.get(eventName)?.(payload));
}

beforeEach(() => {
	socketHandlers.clear();
	vi.mocked(api.listMessages).mockReset().mockResolvedValue([]);
	vi.mocked(api.sendMessage).mockReset();
	localStore.cacheMessageSnapshot.mockReset().mockResolvedValue(undefined);
	localStore.enqueueLocalMessage.mockReset().mockResolvedValue(undefined);
	localStore.readLocalOutbox.mockReset().mockResolvedValue([]);
	localStore.readMessageSnapshot.mockReset().mockResolvedValue([]);
	localStore.removeLocalMessage.mockReset().mockResolvedValue(undefined);
	useAuth.setState({ currentUser: makeCurrentUser() });
});

/**
 * The send path has two ways to learn that a draft became a real message — the
 * broadcast and the HTTP response — and they leave the server together. Only the
 * response used to retire the draft, so whenever the socket won the race the
 * sender's own message stood on screen twice until the response caught up.
 *
 * Both tests below deliberately settle the response *after* the event. That
 * ordering is the bug; it is also the ordering that is hardest to hit on a fast
 * machine, which is why a browser found it before any unit test did.
 */
describe("optimistic send reconciliation", () => {
	it("does not show the message twice when the broadcast beats the response", async () => {
		let settle: (message: MessageDTO) => void = () => {};
		vi.mocked(api.sendMessage).mockReturnValue(
			new Promise<MessageDTO>((resolve) => {
				settle = resolve;
			}),
		);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

		act(() => void view.result.current.sendMessage("hello", [], null));
		await waitFor(() => expect(view.result.current.messages).toHaveLength(1));
		const draftId = view.result.current.messages[0]!.id;

		const saved: MessageDTO = {
			...makeMessage("saved", "minh", "hello"),
			conversationId: "conversation",
			clientId: draftId,
		};
		emit("message:new", saved);

		expect(view.result.current.messages).toHaveLength(1);
		expect(view.result.current.messages[0]!.id).toBe("saved");

		// And the response, arriving late, must not put a second copy back.
		await act(async () => {
			settle(saved);
			await Promise.resolve();
		});
		expect(view.result.current.messages).toHaveLength(1);
	});

	it("still appends a message from somebody else, which carries no clientId", async () => {
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

		emit("message:new", { ...makeMessage("theirs", "an", "hi"), conversationId: "conversation" });

		expect(view.result.current.messages).toHaveLength(1);
		expect(view.result.current.messages[0]!.id).toBe("theirs");
	});

	it("replays a durable outbox item after an offline reload", async () => {
		const author = makeCurrentUser();
		localStore.readLocalOutbox.mockResolvedValue([
			{
				id: "draft:durable",
				userId: author.id,
				conversationId: "conversation",
				author,
				content: "saved before the tab closed",
				replyTo: null,
				mentionedUserIds: [],
				createdAt: "2026-09-04T10:00:00.000Z",
				attachments: [],
			},
		]);
		vi.mocked(api.listMessages).mockRejectedValue(new TypeError("offline"));
		vi.mocked(api.sendMessage).mockResolvedValue({
			...makeMessage("saved", author.id, "saved before the tab closed"),
			conversationId: "conversation",
			clientId: "draft:durable",
		});

		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));

		await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());
		expect(api.sendMessage).toHaveBeenCalledWith(
			"conversation",
			"saved before the tab closed",
			undefined,
			undefined,
			[],
			"draft:durable",
			expect.any(Function),
		);
		await waitFor(() => expect(view.result.current.messages[0]?.id).toBe("saved"));
		expect(localStore.removeLocalMessage).toHaveBeenCalledWith("draft:durable");
		expect(view.result.current.loadError).toBe("");
	});
	it("reports an outbox write failure while preserving the failed message for retry", async () => {
		localStore.enqueueLocalMessage.mockRejectedValue(new Error("Quota exceeded"));
		vi.mocked(api.sendMessage).mockRejectedValue(new Error("Offline"));
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		await act(async () => {
			await view.result.current.sendMessage("keep me", [], null).catch(() => undefined);
		});
		expect(view.result.current.messages[0]?.content).toBe("keep me");
		expect(view.result.current.hasUnsavedMessages).toBe(true);
		vi.mocked(api.sendMessage).mockResolvedValue(makeMessage("saved", "minh", "keep me"));
		act(() => view.result.current.retrySend(view.result.current.messages[0]!.id));
		await waitFor(() => expect(view.result.current.hasUnsavedMessages).toBe(false));
	});

	it("sends a quick burst in the order it was typed, each confirmation in its draft's place", async () => {
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		const resolvers: Array<() => void> = [];
		vi.mocked(api.sendMessage).mockImplementation(
			(conversationId, content, _files, _replyTo, _mentions, clientId) =>
				new Promise((resolve) => {
					resolvers.push(() =>
						resolve({
							...makeMessage(`server-${content}`, "minh", content),
							conversationId,
							...(clientId ? { clientId } : {}),
						}),
					);
				}),
		);
		let sends!: Promise<unknown>;
		act(() => {
			sends = Promise.all(["Hi", "link", "🙏"].map((text) => view.result.current.sendMessage(text, [], null)));
		});
		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
		expect(vi.mocked(api.sendMessage).mock.calls[0]?.[1]).toBe("Hi");
		await act(async () => resolvers[0]!());
		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
		expect(view.result.current.messages.map((message) => message.content)).toEqual(["Hi", "link", "🙏"]);
		expect(view.result.current.messages[0]?.id).toBe("server-Hi");
		await act(async () => resolvers[1]!());
		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(3));
		await act(async () => {
			resolvers[2]!();
			await sends;
		});
		expect(vi.mocked(api.sendMessage).mock.calls.map((call) => call[1])).toEqual(["Hi", "link", "🙏"]);
		expect(view.result.current.messages.map((message) => message.id)).toEqual([
			"server-Hi",
			"server-link",
			"server-🙏",
		]);
	});

	it("blocks duplicate retries and discard while a retry is in flight", async () => {
		vi.mocked(api.sendMessage).mockRejectedValueOnce(new Error("Offline"));
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		await act(async () => {
			await view.result.current.sendMessage("keep me", [], null).catch(() => undefined);
		});
		const draftId = view.result.current.messages[0]!.id;
		let rejectRetry!: (error: Error) => void;
		vi.mocked(api.sendMessage).mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectRetry = reject;
				}),
		);
		act(() => {
			view.result.current.retrySend(draftId);
			view.result.current.retrySend(draftId);
			view.result.current.discardDraft(draftId);
		});
		// Sends wait their turn in the conversation's queue, so the retry starts a tick later.
		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
		expect(view.result.current.messages[0]?.id).toBe(draftId);
		await act(async () => {
			rejectRetry(new Error("Still offline"));
		});
		expect(view.result.current.messages[0]?.deliveryState).toBe("failed");
		act(() => view.result.current.discardDraft(draftId));
		expect(view.result.current.messages).toHaveLength(0);
	});
	it("does not dispatch after logout while the local outbox write is pending", async () => {
		let finishWrite!: () => void;
		localStore.enqueueLocalMessage.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishWrite = resolve;
				}),
		);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(view.result.current.isLoadingThread).toBe(false));
		let pending!: Promise<void>;
		act(() => {
			pending = view.result.current.sendMessage("private", [], null);
		});
		await waitFor(() => expect(localStore.enqueueLocalMessage).toHaveBeenCalled());
		await act(async () => {
			useAuth.setState({ currentUser: null });
			finishWrite();
			await pending;
		});
		expect(api.sendMessage).not.toHaveBeenCalled();
	});
});
