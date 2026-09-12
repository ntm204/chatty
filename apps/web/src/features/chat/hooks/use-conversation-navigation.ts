import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback } from "react";
import type { MessageSearchSession } from "../types/message-search";
import { findFirstUnreadConversation, scrollToMessage } from "../utils";

interface ConversationNavigationParams {
	conversations: ConversationDTO[];
	refreshConversations: () => void;
	setSelectedConversationId: (conversationId: string | null) => void;
	setOpenedSavedConversation: (conversation: ConversationDTO | null) => void;
	setRequestedMessageId: (messageId: string | null) => void;
	setIsConversationSearchOpen: (isOpen: boolean) => void;
}

interface ConversationNavigation {
	handleConversationStarted: (conversationId: string, conversation?: ConversationDTO) => void;
	handleConversationSelected: (conversationId: string) => void;
	selectSearchResult: (session: MessageSearchSession) => void;
	closeMessageSearch: () => void;
	openFirstUnreadConversation: () => void;
	jumpToMessage: (messageId: string) => void;
}

/**
 * The handlers that move `ChatPage` between conversations and search results.
 *
 * Grouped here rather than left inline because every one of them ends the
 * same way — closing search, clearing the requested message, then selecting a
 * conversation — and that shared tail is what a future new entry point (a
 * notification click, a deep link) has to replicate correctly.
 */
export function useConversationNavigation({
	conversations,
	refreshConversations,
	setSelectedConversationId,
	setOpenedSavedConversation,
	setRequestedMessageId,
	setIsConversationSearchOpen,
}: ConversationNavigationParams): ConversationNavigation {
	function handleConversationStarted(conversationId: string, conversation?: ConversationDTO) {
		if (conversation) setOpenedSavedConversation(conversation);
		refreshConversations();
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function handleConversationSelected(conversationId: string) {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function selectSearchResult(session: MessageSearchSession) {
		const result = session.results[session.activeIndex];
		if (!result) return;

		setSelectedConversationId(result.conversation.id);
		setRequestedMessageId(result.message.id);
	}

	const closeMessageSearch = useCallback(() => {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
	}, [setIsConversationSearchOpen, setRequestedMessageId]);

	function openFirstUnreadConversation() {
		const unread = findFirstUnreadConversation(conversations);
		if (unread) handleConversationSelected(unread.id);
	}

	// A miss means the message is outside what the thread currently holds, so the
	// search panel closes and the list is asked to load the page around it.
	const jumpToMessage = useCallback(
		(messageId: string) => {
			if (scrollToMessage(messageId)) return;

			setIsConversationSearchOpen(false);
			setRequestedMessageId(messageId);
		},
		[setIsConversationSearchOpen, setRequestedMessageId],
	);

	return {
		handleConversationStarted,
		handleConversationSelected,
		selectSearchResult,
		closeMessageSearch,
		openFirstUnreadConversation,
		jumpToMessage,
	};
}
