import type { StoryPeopleList } from "@/types/story-people";

export const STORY_PEOPLE_LIST_OPTIONS: { value: StoryPeopleList; label: string }[] = [
	{ value: "close_friends", label: "Close friends" },
	{ value: "hidden", label: "Hide notes from" },
];

/** How long the music search waits after the last keystroke, so typing a title is one request. */
export const NOTE_MUSIC_SEARCH_DEBOUNCE_MS = 300;
