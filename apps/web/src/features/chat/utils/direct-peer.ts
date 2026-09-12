import type { ConversationDTO, ParticipantDTO } from "@chatty/shared-types";

/**
 * The person on the other side of a 1-1 conversation.
 *
 * Null for a group, deliberately: a group has no single "other person", and
 * returning an arbitrary participant would let callers render one member's
 * avatar or online dot as if it stood for the whole thread.
 *
 * Also null for a conversation containing only you — the Saved Messages
 * self-conversation — which callers should check for with `isSavedConversation`
 * before treating a null peer as an error.
 */
export function getDirectPeer(conversation: ConversationDTO, currentUserId: string): ParticipantDTO | null {
	if (conversation.isGroup) return null;

	return conversation.participants.find((participant) => participant.id !== currentUserId) ?? null;
}
