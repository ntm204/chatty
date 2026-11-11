import { act, cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { announceDraftPreview } from "@/features/chat/utils/draft-preview";
import { ConversationList } from "@/features/chat/sidebar/components/conversation-list";
import { useAuth } from "@/hooks/use-auth";
import { makeConversation, makeCurrentUser, makeMessage, makeParticipant } from "./factories";

const conversation = makeConversation({
	participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
	lastMessage: makeMessage("message-1", "an", "ordinary preview"),
});

beforeEach(() => {
	localStorage.clear();
	useAuth.setState({ currentUser: null });
});

function renderList(overrides: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
	render(
		<ConversationList
			conversations={[conversation]}
			currentUserId="minh"
			selectedConversationId={null}
			onlineUserIds={new Set()}
			onSelect={() => undefined}
			typingByConversation={{}}
			paging={{ hasMore: false, isLoadingMore: false, loadMore: () => undefined }}
			{...overrides}
		/>,
	);
}

describe("ConversationList", () => {
	it("does not show another account's persisted or live draft preview", () => {
		localStorage.setItem(
			"chatty:user-draft:an:conversation-1",
			JSON.stringify({ content: "Private An", replyToId: null }),
		);
		renderList();
		act(() => announceDraftPreview("an", "conversation-1", "Private An", null));
		expect(screen.queryByText("Private An")).not.toBeInTheDocument();
		expect(screen.getByText("ordinary preview")).toBeVisible();
	});
	it("prefers a restored draft to typing and the last message without hiding unread", () => {
		localStorage.setItem(
			"chatty:user-draft:minh:conversation-1",
			JSON.stringify({ content: "My unfinished\n reply", replyToId: null }),
		);
		renderList({
			conversations: [{ ...conversation, unreadCount: 3 }],
			typingByConversation: { "conversation-1": ["an"] },
		});
		expect(screen.getByText("Draft:")).toBeVisible();
		expect(screen.getByText("My unfinished reply")).toBeVisible();
		expect(screen.queryByText("Typing")).not.toBeInTheDocument();
		expect(screen.queryByText("ordinary preview")).not.toBeInTheDocument();
		expect(screen.getByLabelText("3 unread messages")).toBeVisible();
	});

	it("updates immediately, represents reply-only drafts and restores typing on clear", () => {
		renderList({ typingByConversation: { "conversation-1": ["an"] } });
		act(() => announceDraftPreview("minh", "conversation-1", "Hello", null));
		expect(screen.getByText("Hello")).toBeVisible();
		act(() => announceDraftPreview("minh", "conversation-1", "", "reply-id"));
		expect(screen.getByText("Reply")).toBeVisible();
		act(() => announceDraftPreview("minh", "conversation-1", "   ", null));
		expect(screen.queryByText("Draft:")).not.toBeInTheDocument();
		expect(screen.getByText("Typing")).toBeVisible();
	});

	it("ignores other conversations and invalid data, and refreshes external storage changes", () => {
		localStorage.setItem("chatty:user-draft:minh:conversation-1", "broken");
		renderList();
		act(() => announceDraftPreview("minh", "other", "Private draft", null));
		expect(screen.queryByText("Draft:")).not.toBeInTheDocument();
		localStorage.setItem(
			"chatty:user-draft:minh:conversation-1",
			JSON.stringify({ content: "Another tab", replyToId: null }),
		);
		act(() => window.dispatchEvent(new StorageEvent("storage", { key: "chatty:user-draft:minh:conversation-1" })));
		expect(screen.getByText("Another tab")).toBeVisible();
		localStorage.clear();
		act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
		expect(screen.getByText("ordinary preview")).toBeVisible();
	});
	it("temporarily replaces the preview when somebody is typing", () => {
		renderList({ typingByConversation: { "conversation-1": ["an"] } });

		expect(screen.getByText("Typing")).toBeInTheDocument();
		expect(screen.queryByText("ordinary preview")).not.toBeInTheDocument();
	});

	it("shows a mention as its own @ badge beside the count, never as a crowding text label", () => {
		renderList({
			conversations: [
				makeConversation({
					participants: conversation.participants,
					unreadCount: 3,
					lastMessage: { ...conversation.lastMessage!, mentionedUserIds: ["minh"] },
				}),
			],
		});

		expect(screen.getByRole("img", { name: "You were mentioned" })).toHaveTextContent("@");
		expect(screen.getByLabelText("3 unread messages")).toHaveTextContent("3");
		expect(screen.queryByText("Mention")).not.toBeInTheDocument();
	});

	it("ticks your last message once when sent and twice once it is read, only while you share receipts", () => {
		const mine = makeMessage("message-9", "minh", "See you there");
		const reader = { ...makeParticipant("an", "An"), lastReadMessageId: "message-9" };
		const read = makeConversation({ participants: [makeParticipant("minh", "Minh"), reader], lastMessage: mine });
		useAuth.setState({ currentUser: makeCurrentUser({ readReceiptsEnabled: true }) });
		renderList({ conversations: [read] });
		expect(screen.getByRole("img", { name: "Read" })).toBeInTheDocument();

		cleanup();
		useAuth.setState({ currentUser: makeCurrentUser({ readReceiptsEnabled: false }) });
		renderList({ conversations: [read] });
		expect(screen.queryByRole("img", { name: "Read" })).toBeNull();
		expect(screen.getByRole("img", { name: "Sent" })).toBeInTheDocument();
	});

	it("counts a muted chat in grey and keeps the time out of colour", () => {
		renderList({
			conversations: [{ ...conversation, unreadCount: 2, mutedUntil: "9999-12-31T23:59:59.999Z" }],
		});
		expect(screen.getByLabelText("2 unread messages")).toHaveClass("bg-ink-faint");
		expect(screen.getByRole("img", { name: "Muted" })).toBeInTheDocument();
	});
});
