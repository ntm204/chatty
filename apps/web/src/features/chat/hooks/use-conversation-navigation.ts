import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback } from "react";
import { api } from "@/api/client";
import type { MessageSearchSession } from "../types/message-search";
import { findFirstUnreadConversation, scrollToMessage } from "../utils";

interface ConversationNavigationParams {
	conversations: ConversationDTO[];
	refreshConversations: () => void;
	setSelectedConversationId: (conversationId: string | null) => void;
	setOpenedSavedConversation: (conversation: ConversationDTO | null) => void;
	setRequestedMessageId: (messageId: string | null) => void;
	setIsConversationSearchOpen: (isOpen: boolean) => void;
	/** A jump is still fetching the window around its message. */
	isNavigationPending: boolean;
}

interface ConversationNavigation {
	openNotificationConversation: (conversationId: string) => Promise<void>;
	handleConversationStarted: (conversationId: string, conversation?: ConversationDTO) => void;
	/** Opens a conversation at one message — from a bookmark or a global search hit. */
	openMessageIn: (conversation: ConversationDTO, messageId: string) => void;
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
	isNavigationPending,
}: ConversationNavigationParams): ConversationNavigation {
	function handleConversationStarted(conversationId: string, conversation?: ConversationDTO) {
		if (conversation) setOpenedSavedConversation(conversation);
		refreshConversations();
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function openMessageIn(conversation: ConversationDTO, messageId: string) {
		handleConversationStarted(conversation.id, conversation);
		setRequestedMessageId(messageId);
	}

	function handleConversationSelected(conversationId: string) {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	async function openNotificationConversation(conversationId: string) {
		try {
			// Archived/unpaged destinations need their DTO before rendering a thread.
			const conversation = await api.getConversation(conversationId);
			handleConversationStarted(conversation.id, conversation);
		} catch {
			// Losing membership must not replace the current thread with an empty pane.
		}
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
			if (scrollToMessage(messageId)) {
				// An earlier jump may still be fetching its window; when it landed it would replace
				// the thread and pull the reader back. Retargeting cancels it (the history effect
				// drops a superseded response) and reloads around where they actually went.
				if (isNavigationPending) setRequestedMessageId(messageId);

				return;
			}

			setIsConversationSearchOpen(false);
			setRequestedMessageId(messageId);
		},
		[isNavigationPending, setIsConversationSearchOpen, setRequestedMessageId],
	);

	return {
		openNotificationConversation,
		handleConversationStarted,
		openMessageIn,
		handleConversationSelected,
		selectSearchResult,
		closeMessageSearch,
		openFirstUnreadConversation,
		jumpToMessage,
	};
}
