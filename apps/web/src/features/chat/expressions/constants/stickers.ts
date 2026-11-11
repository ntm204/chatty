import type { BuiltinStickerKey } from "@chatty/shared-types";

/**
 * A built-in sticker travels through the sticker tray and the send queue as an
 * id like the uploaded ones, under this prefix; `api.sendSticker` sends it to
 * the server as a `stickerKey` instead of a `stickerId`.
 */
export const BUILTIN_STICKER_PREFIX = "builtin:";

/** The tray's labels for the built-in moods, read out to assistive technology. */
export const BUILTIN_STICKER_LABELS: Record<BuiltinStickerKey, string> = {
	wave: "Hi",
	love: "Love",
	lol: "LOL",
	wow: "Wow",
	sad: "Aww",
	sleep: "Sleepy",
	party: "Party",
	ok: "OK",
};

/** Mirrors the API's personal tray limit; the server remains authoritative. */
export const MAX_PERSONAL_STICKERS = 60;
