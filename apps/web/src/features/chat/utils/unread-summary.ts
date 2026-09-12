import type { ConversationDTO } from "@chatty/shared-types";

/** Summed across every conversation, for the empty-state "N unread" status. */
export function getTotalUnreadCount(conversations: ConversationDTO[]): number {
	return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
}

export function findFirstUnreadConversation(conversations: ConversationDTO[]): ConversationDTO | undefined {
	return conversations.find((conversation) => conversation.unreadCount > 0);
}
