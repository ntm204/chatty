import type { StoryDurationHours, StoryKind } from "@chatty/shared-types";
import type { StoryPeopleList } from "../types/story-audience";

export const STORY_KIND_OPTIONS: { value: StoryKind; label: string }[] = [
	{ value: "photo", label: "Photo" },
	{ value: "video", label: "Video" },
	{ value: "text", label: "Text" },
];

/** How long a story lasts — the compact labels, spoken in full. */
export const STORY_DURATION_OPTIONS: { value: StoryDurationHours; label: string; accessibleLabel: string }[] = [
	{ value: 6, label: "6h", accessibleLabel: "6 hours" },
	{ value: 12, label: "12h", accessibleLabel: "12 hours" },
	{ value: 24, label: "24h", accessibleLabel: "24 hours" },
	{ value: 48, label: "48h", accessibleLabel: "48 hours" },
];

export const STORY_PEOPLE_LIST_OPTIONS: { value: StoryPeopleList; label: string }[] = [
	{ value: "close_friends", label: "Close friends" },
	{ value: "hidden", label: "Hide stories from" },
];
