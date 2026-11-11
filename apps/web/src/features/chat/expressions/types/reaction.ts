import type { ReactionEmoji, UserDTO } from "@chatty/shared-types";

/**
 * One emoji on a message, with the people behind it resolved.
 *
 * `ReactionDTO` carries ids because it is broadcast to everybody at once (see
 * the note on it); this is that DTO after the viewer has looked each id up in
 * the participant list, which is the shape the reactor list actually renders.
 *
 * `users` can be shorter than the DTO's `userIds`: somebody who reacted and then
 * left the group is a real id with nobody to name. The list drops them rather
 * than inventing a row, and the count beside the tab comes from the DTO so it
 * still adds up.
 */
export interface ReactionGroup {
	emoji: ReactionEmoji;
	users: UserDTO[];
	/** From the DTO, so a reactor nobody can name is still counted. */
	total: number;
}
