import type { ConversationDTO } from "@chatty/shared-types";

export function isSavedConversation(conversation: ConversationDTO, currentUserId: string) {
	return (
		!conversation.isGroup &&
		conversation.participants.length === 1 &&
		conversation.participants[0]?.id === currentUserId
	);
}
