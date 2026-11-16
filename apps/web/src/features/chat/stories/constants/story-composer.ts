import type { StoryDurationHours } from "@chatty/shared-types";
import type { StoryPeopleList } from "../types/story-audience";

/** How long a story lasts — the compact labels, spoken in full. */
export const STORY_DURATION_OPTIONS: { value: StoryDurationHours; label: string; accessibleLabel: string }[] = [
	{ value: 6, label: "6h", accessibleLabel: "6 hours" },
	{ value: 12, label: "12h", accessibleLabel: "12 hours" },
	{ value: 24, label: "24h", accessibleLabel: "24 hours" },
	{ value: 48, label: "48h", accessibleLabel: "48 hours" },
];

export const STORY_PEOPLE_LIST_OPTIONS: { value: StoryPeopleList; label: string }[] = [
	{ value: "close_friends", label: "Close friends" },
	{ value: "hidden", label: "Hide notes from" },
];

/** How long the music search waits after the last keystroke, so typing a title is one request. */
export const NOTE_MUSIC_SEARCH_DEBOUNCE_MS = 300;
