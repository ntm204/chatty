import type { FriendsTab } from "../types/friends";

export const FRIENDS_TABS: { value: FriendsTab; label: string }[] = [
	{ value: "requests", label: "Requests" },
	{ value: "friends", label: "Friends" },
	{ value: "find", label: "Find people" },
];

/** How long people search waits after the last keystroke, so typing a name is one request. */
export const PEOPLE_SEARCH_DEBOUNCE_MS = 250;
