import type { ConversationDTO } from "@chatty/shared-types";

export function isConversationMuted(conversation: ConversationDTO): boolean {
	return Boolean(conversation.mutedUntil && Date.parse(conversation.mutedUntil) > Date.now());
}
