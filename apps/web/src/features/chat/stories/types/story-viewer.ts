import type { StoryAuthorDTO } from "@chatty/shared-types";

/** Where the viewer is: which person's stories, and which of them. */
export interface StoryPosition {
	groupIndex: number;
	storyIndex: number;
}

/** What the viewer plays: people in row order, each with their stories oldest first. */
export type StoryGroup = Pick<StoryAuthorDTO, "author" | "stories">;

/**
 * An open viewer: the people it plays, frozen in the order they had when it
 * opened — a refetch that re-sorts the row must not swap the person on screen —
 * and where it started.
 */
export interface OpenStoryViewer {
	authorIds: string[];
	start: StoryPosition;
}
