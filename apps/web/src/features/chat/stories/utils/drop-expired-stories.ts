import type { StoryFeedDTO } from "@chatty/shared-types";

/** The row without anything past its 24 hours on this clock — the server's sweep is seconds behind. */
export function dropExpiredStories(feed: StoryFeedDTO, now = Date.now()): StoryFeedDTO {
	const isLive = (story: { expiresAt: string }) => Date.parse(story.expiresAt) > now;

	return {
		mine: feed.mine.filter(isLive),
		authors: feed.authors
			.map((group) => {
				const stories = group.stories.filter(isLive);

				return { ...group, stories, hasUnseen: stories.some((story) => !story.isViewed) };
			})
			.filter((group) => group.stories.length > 0),
	};
}
