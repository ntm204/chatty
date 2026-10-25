/** Router state the chat routes read; settings passes `conversationId` so the thread stays open behind it. */
export interface ConversationRouteState {
	isFromList?: boolean;
	isUnavailable?: boolean;
	conversationId?: string;
}
