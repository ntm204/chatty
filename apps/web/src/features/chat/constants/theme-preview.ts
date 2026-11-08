import type { PreviewMessage } from "../types/theme-preview";

/** The sample conversation the theme preview opens on. */
export const PREVIEW_OPENING: PreviewMessage[] = [
	{ id: 1, text: "Anyone up for hiking on Saturday? 🌲", isMine: false },
	{ id: 2, text: "Count me in!", isMine: true },
	{ id: 3, text: "Bring snacks, the trail is long 😄", isMine: false },
];

/** What the preview "sends", in turn, so the wallpaper can be seen flowing. */
export const PREVIEW_SENT_LINES = [
	"See you at the trailhead at 8",
	"I'll bring the speaker 🎶",
	"Weather looks perfect ☀️",
	"Who's driving? 🚗",
];

/** A received reply after every second sent line keeps both bubble kinds in view. */
export const PREVIEW_REPLY_LINES = ["Haha yes 😂", "On my way!", "Love this 💜"];

/** How often the preview sends, and how many bubbles it keeps on screen. */
export const PREVIEW_SEND_INTERVAL_MS = 2400;
export const PREVIEW_VISIBLE_MESSAGES = 5;

/** The desktop preview's sidebar: names only, drawn as rows like the real list. */
export const PREVIEW_SIDEBAR_ROWS = ["Weekend getaway", "Emma", "Liam", "Mom"];

/** The desktop preview's window, drawn at this size and scaled down to fit. */
export const DESKTOP_PREVIEW_WIDTH = 544;
export const DESKTOP_PREVIEW_HEIGHT = 340;
