import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { announceDraftPreview } from "@/features/chat/utils/draft-preview";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { makeConversation, makeMessage, makeParticipant } from "./factories";

const conversation = makeConversation({
	participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
	lastMessage: makeMessage("message-1", "an", "ordinary preview"),
});

beforeEach(() => localStorage.clear());

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
	it("prefers a restored draft to typing and the last message without hiding unread", () => {
		localStorage.setItem(
			"chatty:draft:conversation-1",
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
		act(() => announceDraftPreview("conversation-1", "Hello", null));
		expect(screen.getByText("Hello")).toBeVisible();
		act(() => announceDraftPreview("conversation-1", "", "reply-id"));
		expect(screen.getByText("Reply")).toBeVisible();
		act(() => announceDraftPreview("conversation-1", "   ", null));
		expect(screen.queryByText("Draft:")).not.toBeInTheDocument();
		expect(screen.getByText("Typing")).toBeVisible();
	});

	it("ignores other conversations and invalid data, and refreshes external storage changes", () => {
		localStorage.setItem("chatty:draft:conversation-1", "broken");
		renderList();
		act(() => announceDraftPreview("other", "Private draft", null));
		expect(screen.queryByText("Draft:")).not.toBeInTheDocument();
		localStorage.setItem(
			"chatty:draft:conversation-1",
			JSON.stringify({ content: "Another tab", replyToId: null }),
		);
		act(() => window.dispatchEvent(new StorageEvent("storage", { key: "chatty:draft:conversation-1" })));
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

	it("uses one compact @ badge instead of adding a label that crowds the row", () => {
		renderList({
			conversations: [
				makeConversation({
					participants: conversation.participants,
					unreadCount: 3,
					lastMessage: { ...conversation.lastMessage!, mentionedUserIds: ["minh"] },
				}),
			],
		});

		expect(screen.getByLabelText("3 unread messages, including a mention")).toHaveTextContent("@");
		expect(screen.queryByText("Mention")).not.toBeInTheDocument();
	});
});
