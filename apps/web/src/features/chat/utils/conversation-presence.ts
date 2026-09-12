import type { ConversationDTO, ParticipantDTO } from "@chatty/shared-types";
import { getDirectPeer } from "./direct-peer";
import { formatLastSeen } from "./format-last-seen";
import { isSavedConversation } from "./is-saved-conversation";

export interface ConversationPresence {
	/** The other person in a 1-1, or null in a group. */
	peer: ParticipantDTO | null;
	isPeerOnline: boolean;
	/** The line a 1-1 shows under the name: "Online", a last-seen phrase, or the opt-out. */
	peerStatus: string;
	/** How many participants are online, which is what a group shows instead. */
	onlineCount: number;
}

/**
 * Everything a surface says about where the other side is.
 *
 * One function because two surfaces now ask the same question — the thread
 * header and the details panel — and they have to give the same answer. It was
 * four lines copied between them, `"Last seen hidden"` included, which is the
 * shape a divergence starts in: change the phrasing or the opt-out fallback in
 * one and the app quietly reports a person's presence two different ways
 * depending on which panel you are looking at.
 *
 * The fallback matters more than it reads. `formatLastSeen` returns null when
 * somebody has turned last-seen off, and that is not the same fact as "we have
 * no timestamp" — so it gets its own sentence rather than an empty line.
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
			? "Your personal storage"
			: isPeerOnline
				? "Online"
				: (lastSeen ?? "Last seen hidden"),
		onlineCount: conversation.participants.filter((participant) => onlineUserIds.has(participant.id)).length,
	};
}
