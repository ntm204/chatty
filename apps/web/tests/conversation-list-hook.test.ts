import type { ConversationDTO, MessageDTO, ServerToClientEvents } from "@chatty/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useConversationList } from "@/features/chat/hooks/use-conversation-list";
import { makeConversation, makeMessage, makeParticipant } from "./factories";

type SocketHandler = (payload: unknown) => void;
const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, SocketHandler>() }));
const localStore = vi.hoisted(() => ({
	cacheConversationPage: vi.fn(),
	readConversationPage: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: { listConversations: vi.fn(), getConversation: vi.fn() } }));
vi.mock("@/lib/local-chat-store", () => localStore);
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => socketHandlers.set(eventName, handler),
}));
vi.mock("@/features/chat/hooks/use-presence-last-seen-sync", () => ({
	usePresenceLastSeenSync: vi.fn(),
}));

const first = makeConversation({
	id: "first",
	participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
	lastMessage: { ...makeMessage("first-old", "an", "old"), conversationId: "first" },
	unreadCount: 1,
	updatedAt: "2026-08-01T10:00:00.000Z",
});
const second = makeConversation({
	id: "second",
	participants: [makeParticipant("minh", "Minh"), makeParticipant("binh", "Binh")],
	lastMessage: { ...makeMessage("second-old", "binh", "newer"), conversationId: "second" },
	updatedAt: "2026-08-02T10:00:00.000Z",
});

function emit<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	payload: Parameters<ServerToClientEvents[EventName]>[0],
): void {
	act(() => socketHandlers.get(eventName)?.(payload));
}

async function renderConversationList(rows: ConversationDTO[] = [second, first]) {
	vi.mocked(api.listConversations).mockResolvedValue({ items: rows, hasMore: false });
	const onLeft = vi.fn();
	const view = renderHook(() => useConversationList("minh", onLeft));
	await waitFor(() => expect(view.result.current.conversations).toHaveLength(rows.length));

	return { ...view, onLeft };
}

beforeEach(() => {
	socketHandlers.clear();
	vi.mocked(api.listConversations).mockReset();
	localStore.cacheConversationPage.mockReset().mockResolvedValue(undefined);
	localStore.readConversationPage.mockReset().mockResolvedValue(null);
});

describe("useConversationList event reducer", () => {
	it("keeps a cached sidebar available when startup is offline", async () => {
		localStore.readConversationPage.mockResolvedValue({ items: [first], hasMore: false });
		vi.mocked(api.listConversations).mockRejectedValue(new TypeError("offline"));

		const view = renderHook(() => useConversationList("minh", vi.fn()));

		await waitFor(() => expect(view.result.current.conversations[0]?.id).toBe("first"));
		expect(localStore.readConversationPage).toHaveBeenCalledWith("minh", false);
	});

	it("patches a new incoming message, raises unread, and reorders the row", async () => {
		const view = await renderConversationList();
		const message = { ...makeMessage("latest", "an", "now"), conversationId: "first" };

		emit("message:new", message);

		expect(view.result.current.conversations[0]).toMatchObject({
			id: "first",
			lastMessage: { id: "latest" },
			unreadCount: 2,
		});
	});

	it("does not count the viewer's message or a system line as unread", async () => {
		const view = await renderConversationList([first]);
		emit("message:new", { ...makeMessage("mine", "minh", "sent"), conversationId: "first" });
		emit("message:new", {
			...makeMessage("system", "minh", "Minh pinned a message"),
			conversationId: "first",
			kind: "system",
			author: null,
		} as MessageDTO);

		expect(view.result.current.conversations[0]?.unreadCount).toBe(1);
	});

	it("patches an edited latest preview without changing row order", async () => {
		const view = await renderConversationList();
		emit("message:updated", { ...second.lastMessage!, content: "corrected" });

		expect(view.result.current.conversations.map((item) => item.id)).toEqual(["second", "first"]);
		expect(view.result.current.conversations[0]?.lastMessage?.content).toBe("corrected");
	});

	it("clears unread and advances the participant when this user reads", async () => {
		const view = await renderConversationList([first]);
		emit("conversation:read", { conversationId: "first", userId: "minh", lastReadMessageId: "first-old" });

		expect(view.result.current.conversations[0]?.unreadCount).toBe(0);
		expect(view.result.current.conversations[0]?.participants[0]?.lastReadMessageId).toBe("first-old");
	});

	it("patches shared conversation details without touching viewer state", async () => {
		const view = await renderConversationList([first]);
		emit("conversation:updated", {
			conversationId: "first",
			name: "Renamed",
			invitePolicy: "managers",
			avatarUrl: null,
			themeColor: null,
			quickReactionEmoji: null,
			participants: first.participants,
		});

		expect(view.result.current.conversations[0]).toMatchObject({
			name: "Renamed",
			invitePolicy: "managers",
			unreadCount: 1,
		});
	});

	it("removes a row when its personal archive state moves it out of this list", async () => {
		const view = await renderConversationList([first]);
		emit("conversation:self-updated", {
			conversationId: "first",
			isPinned: false,
			isArchived: true,
			mutedUntil: null,
		});

		expect(view.result.current.conversations).toEqual([]);
	});

	it("inserts a new conversation once and removes it on conversation:left", async () => {
		const view = await renderConversationList([]);
		emit("conversation:new", first);
		emit("conversation:new", first);
		expect(view.result.current.conversations.map((item) => item.id)).toEqual(["first"]);

		emit("conversation:left", { conversationId: "first" });
		expect(view.result.current.conversations).toEqual([]);
		expect(view.onLeft).toHaveBeenCalledWith("first");
	});
});
