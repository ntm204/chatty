import type { MessageSearchResultDTO } from "@chatty/shared-types";

/**
 * The name to show above a search result.
 *
 * Deliberately not `getConversationTitle`, which takes a whole `ConversationDTO`
 * with participants, unread counts and a last message. A search result carries a
 * deliberately thinner conversation — repeating all of that for every hit would
 * send the same participant list five times for five results in one group.
 *
 * The rule is the same as the sidebar's, though: a group is named, and a direct
 * conversation is titled by whoever you are talking to, which differs per viewer
 * and so cannot be computed on the server.
 */
export function getSearchResultTitle(
	conversation: MessageSearchResultDTO["conversation"],
	currentUserId: string,
): string {
	if (conversation.isGroup) return conversation.name ?? "Group";

	const peer = conversation.participants.find((participant) => participant.id !== currentUserId);

	return (
		peer?.displayName ??
		(conversation.participants.some((participant) => participant.id === currentUserId)
			? "Saved messages"
			: "Unknown")
	);
}
