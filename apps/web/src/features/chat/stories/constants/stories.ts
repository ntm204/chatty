import type { StoryAudience, StoryFeedDTO } from "@chatty/shared-types";

/** How long one story stays on screen before the next one. */
export const STORY_DURATION_MS = 5_000;

/** Reactions a viewer can send in one tap; each becomes a direct message. */
export const QUICK_STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥"];

export const STORY_AUDIENCE_OPTIONS: { value: StoryAudience; label: string }[] = [
	{ value: "contacts", label: "People you chat with" },
	{ value: "close_friends", label: "Close friends" },
];

/** How long after a story-row nudge to refetch, so a burst of nudges is one request. */
export const STORY_REFRESH_DEBOUNCE_MS = 250;

/** The row before it has loaded, or for someone with no contacts posting anything. */
export const EMPTY_STORY_FEED: StoryFeedDTO = { mine: [], authors: [] };

/** A press longer than this is a hold (pause), not a tap (next/previous). */
export const STORY_HOLD_THRESHOLD_MS = 250;
