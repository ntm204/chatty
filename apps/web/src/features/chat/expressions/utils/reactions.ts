import type { ReactionDTO, UserDTO } from "@chatty/shared-types";
import type { ReactionGroup } from "../types/reaction";

/**
 * Resolves the ids on each reaction into the people who left them.
 *
 * Ordered largest first, which is the one place in this feature that reorders:
 * the chips under a bubble keep the server's first-used order so they do not
 * hop under the cursor, but a list nobody is aiming at is more useful sorted by
 * how many agreed.
 */
export function groupReactors(reactions: ReactionDTO[], users: UserDTO[]): ReactionGroup[] {
	return reactions
		.map((reaction) => ({
			emoji: reaction.emoji,
			total: reaction.userIds.length,
			users: reaction.userIds
				.map((userId) => users.find((user) => user.id === userId))
				.filter((user): user is UserDTO => user !== undefined),
		}))
		.sort((left, right) => right.total - left.total);
}

/** The emoji this viewer left on a message, or null. At most one — see `MessageReaction`. */
export function findMyReaction(reactions: ReactionDTO[], currentUserId: string): string | null {
	return reactions.find((reaction) => reaction.userIds.includes(currentUserId))?.emoji ?? null;
}

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
