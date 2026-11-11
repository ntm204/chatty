import type { ChatFolder, ConversationListEmptyState } from "../types/conversation-list";

/** Telegram's folder tabs, built in rather than user-made: the four that cover most reading. */
export const CHAT_FOLDERS: { id: ChatFolder; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "unread", label: "Unread" },
	{ id: "groups", label: "Groups" },
	{ id: "direct", label: "Direct" },
];

/**
 * Above this the unread badge stops counting and says "lots".
 *
 * Not cosmetic: the badge sits in a fixed-width sidebar row, and a four-digit
 * count pushes the conversation name out of it. The exact number past ninety-nine
 * is not information anyone acts on anyway.
 */
export const MAX_UNREAD_BADGE_COUNT = 99;

/** How many recent messages a conversation preview loads. */
export const PREVIEW_MESSAGE_LIMIT = 30;

/** How long a finger rests on a chat row before its preview opens. */
export const LONG_PRESS_MS = 420;

/** How far that finger may drift and still mean "hold", not "scroll". */
export const LONG_PRESS_SLOP_PX = 8;

/** The desktop preview's size and its distance from the sidebar and the window edge. */
export const PREVIEW_POPOVER_WIDTH = 380;
export const PREVIEW_POPOVER_MAX_HEIGHT = 560;
export const PREVIEW_POPOVER_GAP = 12;

/** Why a folder is empty, with the way out, so it never reads like a first visit. */
export const FOLDER_EMPTY_STATES: Record<Exclude<ChatFolder, "all">, ConversationListEmptyState> = {
	unread: { title: "You're all caught up", description: "New messages will show up here." },
	groups: { title: "No groups yet", description: "Start a group from New chat." },
	direct: { title: "No direct chats yet", description: "Find someone by name or @handle to start one." },
};

export const ARCHIVE_EMPTY_STATE: ConversationListEmptyState = {
	title: "No archived chats",
	description: "Archive a chat from its menu to tuck it away here.",
};
