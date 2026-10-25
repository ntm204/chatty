import type { ConversationDTO, ParticipantDTO } from "@chatty/shared-types";
import { getDirectPeer } from "./direct-peer";
import { formatLastSeen } from "./format-last-seen";
import { isSavedConversation } from "./is-saved-conversation";

export interface ConversationPresence {
	/** The other person in a 1-1, or null in a group. */
	peer: ParticipantDTO | null;
	isPeerOnline: boolean;
	/** The line a 1-1 shows under the name: "Online" or a last-seen phrase; null when they hide it. */
	peerStatus: string | null;
	/** How many participants are online, which is what a group shows instead. */
	onlineCount: number;
}

/**
 * Everything a surface says about where the other side is.
 *
 * One function because two surfaces now ask the same question — the thread
 * header and the details panel — and they have to give the same answer. It was
 * four lines copied between them, which is the shape a divergence starts in:
 * change the phrasing or the opt-out fallback in one and the app quietly reports
 * a person's presence two different ways depending on which panel you are
 * looking at.
 *
 * A hidden last-seen is null, not a sentence. "Last seen hidden" told the reader
 * nothing they could act on; the header drops the line instead of leaving an
 * empty one, so the name centres rather than looking like it is still loading.
 */
export function getConversationPresence(
	conversation: ConversationDTO,
	currentUserId: string,
	onlineUserIds: Set<string>,
): ConversationPresence {
	const peer = getDirectPeer(conversation, currentUserId);
	const isPeerOnline = Boolean(peer && onlineUserIds.has(peer.id));
	const lastSeen = formatLastSeen(peer?.lastSeenAt ?? null);

	return {
		peer,
		isPeerOnline,
		peerStatus: isSavedConversation(conversation, currentUserId)
			? "Only you can see this"
			: isPeerOnline
				? "Online"
				: lastSeen,
		onlineCount: conversation.participants.filter((participant) => onlineUserIds.has(participant.id)).length,
	};
}
