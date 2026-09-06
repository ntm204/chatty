import type { ConversationDTO } from "@chatty/shared-types";
import { getDirectPeer } from "./direct-peer";

/**
 * The name to show for a conversation.
 *
 * A group is always titled by its own name — there is no separate "rename
 * this thread for just me" concept since ADR 0022, only per-member nicknames.
 * A 1-1 conversation has no stored name of its own; it is titled by the peer's
 * nickname if one is set for them in this conversation, else their real name.
 */
export function getConversationTitle(conversation: ConversationDTO, currentUserId: string): string {
	if (conversation.isGroup) return conversation.name ?? "Group";

	const peer = getDirectPeer(conversation, currentUserId);

	return peer?.nickname ?? peer?.displayName ?? "Unknown";
}
