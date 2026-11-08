import type { ReactionDTO, UserDTO } from "@chatty/shared-types";

/**
 * One line of the reaction pill's native tooltip: the emoji, and who left it.
 *
 * Still worth having beside the reactor list rather than replaced by it. A
 * tooltip costs no click and no dialog, which is the right price for "who put
 * the heart there" in a conversation between two people; the list is for the
 * group where the answer does not fit in a title attribute, and for a touch
 * screen, which no tooltip reaches.
 */
export function getReactionSummary(reaction: ReactionDTO, users: UserDTO[], currentUserId: string): string {
	const names = reaction.userIds.map((userId) => {
		if (userId === currentUserId) return "you";

		return users.find((user) => user.id === userId)?.displayName ?? "Someone";
	});

	return `${reaction.emoji} ${names.join(", ")}`;
}
