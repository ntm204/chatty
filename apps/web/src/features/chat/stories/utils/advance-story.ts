import type { StoryGroup, StoryPosition } from "../types/story-viewer";

/**
 * The next position in the row, or null at the very end. Within one person's
 * stories, then on to the next person — the row plays through and then stops.
 */
export function nextStoryPosition(groups: StoryGroup[], position: StoryPosition): StoryPosition | null {
	const group = groups[position.groupIndex];
	if (group && position.storyIndex + 1 < group.stories.length) {
		return { groupIndex: position.groupIndex, storyIndex: position.storyIndex + 1 };
	}

	return position.groupIndex + 1 < groups.length ? { groupIndex: position.groupIndex + 1, storyIndex: 0 } : null;
}

/** The previous position, or null at the very start; stepping back enters a person's last story. */
export function previousStoryPosition(groups: StoryGroup[], position: StoryPosition): StoryPosition | null {
	if (position.storyIndex > 0) return { groupIndex: position.groupIndex, storyIndex: position.storyIndex - 1 };
	const previous = groups[position.groupIndex - 1];

	return previous ? { groupIndex: position.groupIndex - 1, storyIndex: previous.stories.length - 1 } : null;
}

/** Where to start a person's stories: their first unseen one, or the beginning. */
export function firstUnseenIndex(group: StoryGroup): number {
	const index = group.stories.findIndex((story) => !story.isViewed);

	return index === -1 ? 0 : index;
}
