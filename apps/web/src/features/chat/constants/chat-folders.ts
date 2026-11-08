import type { ChatFolder } from "../types/chat-folder";

/** Telegram's folder tabs, built in rather than user-made: the four that cover most reading. */
export const CHAT_FOLDERS: { id: ChatFolder; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "unread", label: "Unread" },
	{ id: "groups", label: "Groups" },
	{ id: "direct", label: "Direct" },
];
