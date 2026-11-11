import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";

export interface ReadReceipt {
	/** The newest message of yours that somebody else has read. */
	messageId: string;
	/** How many other participants have read it. Meaningful in a group; always 1 in a 1-1. */
	readerCount: number;
	readerIds: string[];
}

/**
 * Where to draw the "Seen" marker in a message list.
 *
 * Read markers point at *a* message, and reading is cumulative: a participant
 * whose marker sits on message 40 has read 1 through 40. So the question "has
 * anyone seen this?" becomes "is it at or before someone's marker", which is a
 * comparison of positions in the list — not of timestamps, and not of ids.
 *
 * Returns one receipt, on your newest seen message, rather than one per
 * message: a "Seen" under every line is noise, since everything above the last
 * one is seen too.
 *
 * Null when the answer is not knowable from what is loaded. A marker pointing at
 * a message from an older page is not found here, and guessing that it must
 * therefore be older would claim messages were read that may not have been.
 *
 * Null too when `areReceiptsShared` is false — the viewer has turned read
 * receipts off, and the setting is symmetric: hiding yours while still reading
 * everyone else's is the arrangement people are right to call unfair. This is the
 * only half of the symmetry the client owns. The other half is not a rendering
 * decision at all: a participant with receipts off has no shared marker in the
 * database, so their position never reaches anybody's browser to be hidden.
 */
export function getReadReceipt(
	messages: MessageDTO[],
	participants: ParticipantDTO[],
	currentUserId: string,
	areReceiptsShared: boolean,
): ReadReceipt | null {
	if (!areReceiptsShared) return null;

	const others = participants.filter((participant) => participant.id !== currentUserId);

	const markerIndexes = others
		.map((participant) => messages.findIndex((message) => message.id === participant.lastReadMessageId))
		.filter((index) => index >= 0);

	if (markerIndexes.length === 0) return null;

	const furthestIndex = Math.max(...markerIndexes);

	// Walk back from the furthest thing anyone has read to the last message that
	// was actually yours — a receipt on somebody else's message says nothing.
	for (let index = furthestIndex; index >= 0; index -= 1) {
		const message = messages[index]!;

		// A system message has no author, so it is never "yours" — a "Seen" under
		// "Chi left the group" would be claiming a receipt for nobody's message.
		if (message.author?.id === currentUserId) {
			const readerIds = others
				.filter((participant) => {
					const markerIndex = messages.findIndex((item) => item.id === participant.lastReadMessageId);

					return markerIndex >= index;
				})
				.map((participant) => participant.id);

			return {
				messageId: message.id,
				readerCount: readerIds.length,
				readerIds,
			};
		}
	}

	return null;
}
