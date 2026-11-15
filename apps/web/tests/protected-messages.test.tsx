import { act, createEvent, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { MessageInput } from "@/features/chat/composer/components/message-input";
import { PROTECTED_MESSAGE_TEXT } from "@/features/chat/constants/message";
import { useMessageExpiry } from "@/features/chat/hooks/use-message-expiry";
import { MessageList } from "@/features/chat/thread/components/message-list";
import type { ThreadMessage } from "@/features/chat/types/thread-message";
import { describeProtectedContent, describeProtectedStatus } from "@/features/chat/thread/utils/protected-message";
import { getConversationPreview } from "@/features/chat/utils";
import { toReplyQuote } from "@/features/chat/utils/reply-quote";
import { useAuth } from "@/hooks/use-auth";
import { isExpiredMessage } from "@/utils/is-expired-message";
import { makeCurrentUser, makeMessage, makeParticipant, serverError } from "./factories";

Element.prototype.scrollTo ??= function scrollTo() {};

vi.mock("@/features/chat/composer/hooks/use-typing-notifier", () => ({
	useTypingNotifier: () => ({ notifyTyping: vi.fn(), stopTyping: vi.fn() }),
}));
vi.mock("@/features/chat/expressions/hooks/use-stickers", () => ({
	useStickers: () => ({ stickers: [], isLoading: false, error: "", add: vi.fn(), remove: vi.fn() }),
}));

const FUTURE = "2099-01-01T00:00:00.000Z";

function protectedFrom(authorId: string, content: string, openedByUserIds: string[] = []) {
	return {
		...makeMessage(`protected-${authorId}`, authorId, content),
		expiresAt: FUTURE,
		protection: { openedByUserIds, imageCount: 0, hasText: true },
	};
}

function renderThread(messages: ThreadMessage[]) {
	return render(
		<MessageList
			conversationId="conversation-1"
			messages={messages}
			unreadCount={0}
			currentUserId="minh"
			participants={[makeParticipant("minh", "Minh"), makeParticipant("an", "An")]}
			isGroup={false}
			themeColor={null}
			areReceiptsShared
			isLoadingThread={false}
			hasMoreOlder={false}
			isLoadingOlder={false}
			onLoadOlder={vi.fn()}
			hasMoreNewer={false}
			isLoadingNewer={false}
			onLoadNewer={vi.fn()}
			onEditMessage={vi.fn()}
			onDeleteMessage={vi.fn()}
			onHideMessage={vi.fn()}
			onRetrySend={vi.fn()}
			onDiscardDraft={vi.fn()}
			onToggleReaction={vi.fn()}
			onReplyToMessage={vi.fn()}
			onForwardMessage={vi.fn()}
			onTogglePinMessage={vi.fn()}
			pinnedMessageIds={[]}
			onJumpToMessage={vi.fn()}
			onTrimHistory={vi.fn()}
			requestEditLast={0}
			requestCancelEdit={0}
			onEditingStateChange={vi.fn()}
		/>,
	);
}

beforeEach(() => {
	useAuth.setState({ currentUser: makeCurrentUser() } as never);
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe("protected messages in the thread", () => {
	it("show recipients a cover — never the content — and the author their own words with its status", () => {
		renderThread([protectedFrom("an", ""), protectedFrom("minh", "my own secret")]);

		expect(screen.getByRole("button", { name: "Open protected message" })).toBeEnabled();
		expect(screen.getByText("Tap to open · once")).toBeInTheDocument();
		expect(screen.getByText("my own secret")).toBeInTheDocument();
		expect(screen.getByText(/Protected · Not opened yet/)).toBeInTheDocument();
	});

	it("tells the author once it has been opened", () => {
		renderThread([protectedFrom("minh", "my own secret", ["an"])]);

		expect(screen.getByText(/Protected · Opened/)).toBeInTheDocument();
	});

	it("open once in a viewer that names the viewer, refuses copying, and leaves only 'Opened' behind", async () => {
		const open = vi
			.spyOn(api, "openProtectedMessage")
			.mockResolvedValue({ content: "the secret", attachments: [] });
		renderThread([protectedFrom("an", "")]);

		await userEvent.click(screen.getByRole("button", { name: "Open protected message" }));
		const dialog = await screen.findByRole("dialog", { name: "Protected message" });
		expect(open).toHaveBeenCalledWith("conversation-1", "protected-an");
		expect(within(dialog).getByText("the secret")).toBeInTheDocument();
		expect(within(dialog).getAllByText("Minh @minh").length).toBeGreaterThan(1);
		expect(within(dialog).getByText(/Chatty can't stop screenshots/)).toBeInTheDocument();

		const copy = createEvent.copy(within(dialog).getByText("the secret"));
		fireEvent(within(dialog).getByText("the secret"), copy);
		expect(copy.defaultPrevented).toBe(true);

		await userEvent.click(within(dialog).getByRole("button", { name: "Close protected message" }));
		expect(screen.queryByText("the secret")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Protected message, opened" })).toBeDisabled();
		expect(open).toHaveBeenCalledTimes(1);
	});

	it("cover the opened content whenever the window is not in front", async () => {
		vi.spyOn(api, "openProtectedMessage").mockResolvedValue({ content: "the secret", attachments: [] });
		const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
		renderThread([protectedFrom("an", "")]);
		await userEvent.click(screen.getByRole("button", { name: "Open protected message" }));
		await screen.findByText("the secret");

		hasFocus.mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("blur"));
		});
		expect(screen.getByText("Hidden while Chatty is in the background")).toBeInTheDocument();

		hasFocus.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("focus"));
		});
		expect(screen.queryByText("Hidden while Chatty is in the background")).not.toBeInTheDocument();
	});

	it("explain a refused open where it happened", async () => {
		vi.spyOn(api, "openProtectedMessage").mockRejectedValue(serverError("You have already opened this message"));
		renderThread([protectedFrom("an", "")]);

		await userEvent.click(screen.getByRole("button", { name: "Open protected message" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("You have already opened this message");
	});

	it("offer no forward, pin or bookmark — and no edit for the author", async () => {
		renderThread([protectedFrom("minh", "my own secret")]);

		await userEvent.click(screen.getAllByRole("button", { name: "Message actions" })[0]!);
		const menu = await screen.findByRole("menu");
		const items = within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent);
		expect(items.join(" | ")).not.toMatch(/Forward|Pin message|Bookmark message|Edit/);
		expect(items.join(" | ")).toMatch(/Reply|Select|Delete/);
	});
});

describe("sending a protected message", () => {
	const onSend = vi.fn();

	function renderComposer(participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An")]) {
		return render(
			<MessageInput
				conversationId="conversation-1"
				participants={participants}
				currentUserId="minh"
				replyTo={null}
				onCancelReply={vi.fn()}
				onSend={onSend}
				onSendSticker={vi.fn()}
				onSendFile={vi.fn().mockResolvedValue(undefined)}
				onSendVoice={vi.fn().mockResolvedValue(undefined)}
				onRestoreReply={vi.fn()}
			/>,
		);
	}

	beforeEach(() => {
		onSend.mockReset().mockResolvedValue(undefined);
		localStorage.clear();
	});

	it("is offered once there is something to send, explains itself, and applies to one message only", async () => {
		renderComposer();
		expect(screen.queryByRole("button", { name: "Protect this message" })).not.toBeInTheDocument();

		await userEvent.type(screen.getByLabelText("Message"), "between us");
		await userEvent.click(screen.getByRole("button", { name: "Protect this message" }));
		expect(screen.getByRole("status")).toHaveTextContent("Opens once, gone within 24h");
		expect(screen.getByRole("status")).toHaveTextContent("Chatty can't block screenshots");

		await userEvent.click(screen.getByRole("button", { name: "Send protected message" }));
		expect(onSend).toHaveBeenCalledWith("between us", [], null, [], true);

		await userEvent.type(screen.getByLabelText("Message"), "ordinary");
		expect(screen.getByRole("button", { name: "Protect this message" })).toHaveAttribute("aria-pressed", "false");
		await userEvent.click(screen.getByRole("button", { name: "Send message" }));
		expect(onSend).toHaveBeenLastCalledWith("ordinary", [], null, [], false);
	});

	it("can be turned back off from its notice", async () => {
		renderComposer();
		await userEvent.type(screen.getByLabelText("Message"), "maybe not");
		await userEvent.click(screen.getByRole("button", { name: "Protect this message" }));
		await userEvent.click(screen.getByRole("button", { name: "Send as a normal message" }));

		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
	});

	it("is not offered in your own Saved chat", async () => {
		renderComposer([makeParticipant("minh", "Minh")]);
		await userEvent.type(screen.getByLabelText("Message"), "note to self");

		expect(screen.queryByRole("button", { name: "Protect this message" })).not.toBeInTheDocument();
	});
});

describe("protected and disappearing message helpers", () => {
	it("describe what is behind the cover and who opened it", () => {
		expect(describeProtectedContent({ openedByUserIds: [], imageCount: 0, hasText: true })).toBe("Message");
		expect(describeProtectedContent({ openedByUserIds: [], imageCount: 1, hasText: false })).toBe("Photo");
		expect(describeProtectedContent({ openedByUserIds: [], imageCount: 3, hasText: true })).toBe("3 photos");
		expect(describeProtectedStatus({ openedByUserIds: [], imageCount: 0, hasText: true }, 2)).toBe(
			"Not opened yet",
		);
		expect(describeProtectedStatus({ openedByUserIds: ["an"], imageCount: 0, hasText: true }, 2)).toBe("Opened");
		expect(describeProtectedStatus({ openedByUserIds: ["an"], imageCount: 0, hasText: true }, 4)).toBe(
			"Opened by 1 of 3",
		);
	});

	it("never preview or quote a protected message's content, even the author's", () => {
		const mine = protectedFrom("minh", "my own secret");

		expect(getConversationPreview(mine)).toBe(PROTECTED_MESSAGE_TEXT);
		expect(toReplyQuote(mine)).toMatchObject({ content: "", hasAttachment: false, isProtected: true });
	});

	it("treat a message past its expiry as gone", () => {
		const message = { ...makeMessage("m", "an", "brief"), expiresAt: "2026-01-01T00:00:00.000Z" };

		expect(isExpiredMessage(message, Date.parse("2026-01-01T00:00:01.000Z"))).toBe(true);
		expect(isExpiredMessage(message, Date.parse("2025-12-31T23:59:59.000Z"))).toBe(false);
		expect(isExpiredMessage(makeMessage("k", "an", "kept"))).toBe(false);
		expect(getConversationPreview({ ...message })).not.toBe("brief");
	});

	it("take a disappearing message off the thread at its instant", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-14T10:00:00.000Z"));
		const brief = { ...makeMessage("brief", "an", "brief"), expiresAt: "2026-11-14T10:00:05.000Z" };
		const kept = makeMessage("kept", "an", "kept");
		const { result } = renderHook(() => {
			const [messages, setMessages] = useState<ThreadMessage[]>([kept, brief]);
			useMessageExpiry(messages, setMessages);

			return messages;
		});

		act(() => {
			vi.advanceTimersByTime(4_000);
		});
		expect(result.current.map((message) => message.id)).toEqual(["kept", "brief"]);
		act(() => {
			vi.advanceTimersByTime(1_500);
		});
		expect(result.current.map((message) => message.id)).toEqual(["kept"]);
		vi.useRealTimers();
	});
});
