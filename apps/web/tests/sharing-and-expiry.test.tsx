import "fake-indexeddb/auto";
import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingNotifier } from "@/features/chat/composer/hooks/use-typing-notifier";
import { ConversationSharingControl } from "@/features/chat/details/components/conversation-sharing-control";
import { MessageList } from "@/features/chat/thread/components/message-list";
import { formatTimeLeft } from "@/features/chat/thread/utils/format-time-left";
import type { ThreadMessage } from "@/features/chat/types/thread-message";
import { getDraftPreview } from "@/features/chat/utils/draft-preview";
import { useAuth } from "@/hooks/use-auth";
import { cacheMessageSnapshot, purgeExpiredMessages, readMessageSnapshot } from "@/lib/local-chat-store";
import { api } from "@/api/client";
import { makeAttachment, makeCurrentUser, makeMessage, makeParticipant } from "./factories";

const emitted = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/socket", () => ({
	getSocket: () => ({ emit: (name: string) => emitted.push(name), on: vi.fn(), off: vi.fn() }),
}));

Element.prototype.scrollTo ??= function scrollTo() {};

function threadProps(messages: ThreadMessage[]): React.ComponentProps<typeof MessageList> {
	return {
		conversationId: "conversation-1",
		messages,
		unreadCount: 0,
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		isGroup: false,
		themeColor: null,
		areReceiptsShared: true,
		isLoadingThread: false,
		hasMoreOlder: false,
		isLoadingOlder: false,
		onLoadOlder: vi.fn(),
		hasMoreNewer: false,
		isLoadingNewer: false,
		onLoadNewer: vi.fn(),
		onEditMessage: vi.fn(),
		onDeleteMessage: vi.fn(),
		onHideMessage: vi.fn(),
		onRetrySend: vi.fn(),
		onDiscardDraft: vi.fn(),
		onToggleReaction: vi.fn(),
		onReplyToMessage: vi.fn(),
		onForwardMessage: vi.fn(),
		onTogglePinMessage: vi.fn(),
		pinnedMessageIds: [],
		onJumpToMessage: vi.fn(),
		onTrimHistory: vi.fn(),
		requestEditLast: 0,
		requestCancelEdit: 0,
		onEditingStateChange: vi.fn(),
	};
}

function renderThread(messages: ThreadMessage[]) {
	return render(<MessageList {...threadProps(messages)} />);
}

async function menuItemsFor(index: number): Promise<string> {
	await userEvent.click(screen.getAllByRole("button", { name: "Message actions" })[index]!);
	const menu = await screen.findByRole("menu");

	return within(menu)
		.getAllByRole("menuitem")
		.map((item) => item.textContent)
		.join(" | ");
}

beforeEach(() => {
	emitted.length = 0;
	useAuth.setState({ currentUser: makeCurrentUser() } as never);
});
afterEach(() => vi.useRealTimers());

describe("forwarding restriction in the thread", () => {
	it("hides Forward on someone else's message once they turned sharing off, and deters selecting it", async () => {
		renderThread([{ ...makeMessage("theirs", "an", "keep this between us"), isForwardable: false }]);

		expect(await menuItemsFor(0)).not.toMatch(/Forward/);
		expect(screen.getByText("keep this between us").closest(".chat-bubble")).toHaveClass("select-none");
	});

	it("keeps Forward on a forwardable message, and on your own even with sharing off", async () => {
		renderThread([{ ...makeMessage("mine", "minh", "my words"), isForwardable: false }]);
		expect(await menuItemsFor(0)).toMatch(/Forward/);
	});
});

describe("sharing restriction for photos and whole chats", () => {
	it("offers no save in the viewer for a restricted photo, but keeps it for your own", async () => {
		renderThread([{ ...makeMessage("theirs", "an", "", [makeAttachment({ id: "a1" })]), isForwardable: false }]);
		await userEvent.click(screen.getByRole("button", { name: "Open image" }));
		expect(await screen.findByRole("button", { name: "Close image preview" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save this image" })).not.toBeInTheDocument();
	});

	it("keeps save for your own photo in a restricted chat", async () => {
		renderThread([{ ...makeMessage("mine", "minh", "", [makeAttachment({ id: "a2" })]), isForwardable: false }]);
		await userEvent.click(screen.getByRole("button", { name: "Open image" }));
		expect(await screen.findByRole("button", { name: "Save this image" })).toBeInTheDocument();
	});

	it("drops Forward and save from messages already on screen the moment the chat restricts sharing", async () => {
		const view = renderThread([
			{ ...makeMessage("mine", "minh", "my words") },
			{ ...makeMessage("photo", "an", "", [makeAttachment({ id: "a3" })]) },
		]);
		expect(await menuItemsFor(0)).toMatch(/Forward/);
		await userEvent.keyboard("{Escape}");

		view.rerender(
			<MessageList
				{...threadProps([
					{ ...makeMessage("mine", "minh", "my words") },
					{ ...makeMessage("photo", "an", "", [makeAttachment({ id: "a3" })]) },
				])}
				isSharingRestricted
			/>,
		);
		expect(await menuItemsFor(0)).not.toMatch(/Forward/);
		await userEvent.keyboard("{Escape}");
		await userEvent.click(screen.getByRole("button", { name: "Open image" }));
		await screen.findByRole("button", { name: "Close image preview" });
		expect(screen.queryByRole("button", { name: "Save this image" })).not.toBeInTheDocument();
	});

	it("turns chat forwarding off from the details switch, and is read-only for group members", async () => {
		const setSharing = vi.spyOn(api, "setSharingRestriction").mockResolvedValue({} as never);
		const { unmount } = render(<ConversationSharingControl conversationId="c1" isRestricted={false} canChange />);
		await userEvent.click(screen.getByRole("switch", { name: "Allow forwarding in this chat" }));
		expect(setSharing).toHaveBeenCalledWith("c1", true);
		unmount();

		render(<ConversationSharingControl conversationId="c1" isRestricted canChange={false} />);
		expect(screen.getByRole("switch", { name: "Allow forwarding in this chat" })).toBeDisabled();
		expect(screen.getByText("Only admins can change this.")).toBeInTheDocument();
	});
});

describe("typing privacy", () => {
	it("sends no typing signal while you have stopped sharing it", () => {
		useAuth.setState({ currentUser: makeCurrentUser({ typingIndicatorsEnabled: false }) } as never);
		const { result } = renderHook(() => useTypingNotifier("conversation-1"));
		result.current.notifyTyping();
		expect(emitted).toEqual([]);

		useAuth.setState({ currentUser: makeCurrentUser({ typingIndicatorsEnabled: true }) } as never);
		result.current.notifyTyping();
		expect(emitted).toEqual(["typing:start"]);
	});
});

describe("disappearing details", () => {
	it("shows a protected draft's cover in the sidebar, never its words", () => {
		expect(getDraftPreview(JSON.stringify({ content: "secret plan", replyToId: null, isProtected: true }))).toBe(
			"Protected message",
		);
		expect(getDraftPreview(JSON.stringify({ content: "secret plan", replyToId: null }))).toBe("secret plan");
	});

	it("says how long a message has left, never rounding up", () => {
		const now = Date.parse("2026-11-14T10:00:00.000Z");
		expect(formatTimeLeft("2026-11-20T11:00:00.000Z", now)).toBe("6d");
		expect(formatTimeLeft("2026-11-15T09:59:00.000Z", now)).toBe("23h");
		expect(formatTimeLeft("2026-11-14T10:45:30.000Z", now)).toBe("45m");
		expect(formatTimeLeft("2026-11-14T10:00:20.000Z", now)).toBe("<1m");
	});

	it("puts the time left beside a disappearing message", () => {
		renderThread([
			{ ...makeMessage("brief", "an", "brief"), expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString() },
		]);
		expect(screen.getByLabelText("Disappears in 2h")).toBeInTheDocument();
	});

	it("clears expired messages from every cached thread at session start", async () => {
		const userId = "purge-at-start";
		const expired = { ...makeMessage("gone", "an", "gone"), expiresAt: new Date(Date.now() - 1000).toISOString() };
		const kept = makeMessage("kept", "an", "kept");
		// Written as an older client would have, before it knew to drop expired messages.
		await cacheMessageSnapshot(userId, "other-thread", [kept]);
		const openDB = indexedDB.open("chatty-local", 1);
		await new Promise<void>((resolve) => {
			openDB.onsuccess = () => {
				const store = openDB.result
					.transaction("message-snapshots", "readwrite")
					.objectStore("message-snapshots");
				store.put({
					key: `${userId}:other-thread`,
					userId,
					conversationId: "other-thread",
					messages: [expired, kept],
				});
				store.transaction.oncomplete = () => resolve();
			};
		});

		await purgeExpiredMessages(userId);

		const raw = await new Promise<{ messages: { id: string }[] }>((resolve) => {
			const request = indexedDB.open("chatty-local", 1);
			request.onsuccess = () => {
				const get = request.result
					.transaction("message-snapshots")
					.objectStore("message-snapshots")
					.get(`${userId}:other-thread`);
				get.onsuccess = () => resolve(get.result as { messages: { id: string }[] });
			};
		});
		expect(raw.messages.map((message) => message.id)).toEqual(["kept"]);
		expect((await readMessageSnapshot(userId, "other-thread")).map((message) => message.id)).toEqual(["kept"]);
	});
});
