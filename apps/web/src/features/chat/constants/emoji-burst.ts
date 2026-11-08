/** The emoji that burst across the screen when sent on their own, as Telegram's interactive emoji do. */
export const BURST_EMOJI = ["🎉", "❤️", "👍"] as const;

/** A message younger than this when it appears is "live" and bursts by itself; older ones wait for a tap. */
export const BURST_FRESH_MS = 10_000;

/** Confetti colours: the sticker palette, fixed in both themes. */
export const BURST_CONFETTI_COLOURS = ["#fbc80b", "#ef5b7a", "#5aa9e6", "#6fbf73", "#b46cff", "#ff8a5c"];
