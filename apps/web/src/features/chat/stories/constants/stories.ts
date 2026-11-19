import type { StoryAudience, StoryFeedDTO } from "@chatty/shared-types";

/** Facebook's choices for a note. "contacts" is not offered; older notes carrying it still read right. */
export const STORY_AUDIENCE_OPTIONS: { value: StoryAudience; label: string }[] = [
	{ value: "friends", label: "Friends" },
	{ value: "followers", label: "Followers" },
	{ value: "close_friends", label: "Close friends" },
];

/** How each audience reads on your own note, older ones included. */
export const STORY_AUDIENCE_LABELS: Record<StoryAudience, string> = {
	friends: "friends",
	followers: "followers",
	close_friends: "close friends",
	contacts: "people you chat with",
};

/** How long after a notes-row nudge to refetch, so a burst of nudges is one request. */
export const STORY_REFRESH_DEBOUNCE_MS = 250;

/** The row before it has loaded, or for someone with no contacts posting anything. */
export const EMPTY_STORY_FEED: StoryFeedDTO = { mine: [], authors: [] };

/** A note lasts a day, as on Messenger; there is no other choice to make. */
export const NOTE_LIFETIME_HOURS = 24;
