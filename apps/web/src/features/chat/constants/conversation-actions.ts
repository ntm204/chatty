export const CONVERSATION_MUTE_OPTIONS = [
	{ label: "15 minutes", milliseconds: 15 * 60 * 1000 },
	{ label: "1 hour", milliseconds: 60 * 60 * 1000 },
	{ label: "8 hours", milliseconds: 8 * 60 * 60 * 1000 },
	{ label: "24 hours", milliseconds: 24 * 60 * 60 * 1000 },
	{ label: "Forever", milliseconds: null },
] as const;
