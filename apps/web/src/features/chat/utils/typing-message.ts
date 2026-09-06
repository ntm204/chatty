import type { ParticipantDTO } from "@chatty/shared-types";
import { MAX_NAMED_TYPERS } from "../constants/typing";

/**
 * The sentence for a typing indicator, or null when nobody is typing.
 *
 * Takes ids and resolves them against the participant list rather than carrying
 * names in the socket event: names change, the event is ephemeral, and sending
 * a name with every keystroke would be shipping a profile several times a
 * sentence to say something the client already knows.
 *
 * An id with no matching participant is dropped rather than shown as "Unknown".
 * It means someone joined the conversation after this list was fetched — a
 * transient gap that resolves on the next refresh, and not worth a placeholder.
 */
export function getTypingMessage(typingUserIds: string[], participants: ParticipantDTO[]): string | null {
	const names = [...new Set(typingUserIds)]
		.map((userId) => {
			const participant = participants.find((candidate) => candidate.id === userId);

			return participant?.nickname ?? participant?.displayName;
		})
		.filter((displayName): displayName is string => Boolean(displayName));

	if (names.length === 0) return null;
	if (names.length === 1) return `${names[0]} is typing…`;
	if (names.length <= MAX_NAMED_TYPERS) return `${names.join(" and ")} are typing…`;

	return `${names.length} people are typing…`;
}
