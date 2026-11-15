/**
 * The three timings that make a typing indicator behave.
 *
 * They are related, and changing one alone breaks it:
 * REFRESH < IDLE keeps a continuously typing sender announced, and
 * EXPIRY > REFRESH + IDLE means a receiver only gives up after the sender has
 * had time to both stop and say so.
 */

/** How often a sender re-announces while still typing, so receivers do not time them out. */
export const TYPING_REFRESH_MS = 3000;

/** Silence after which a sender announces that it has stopped. */
export const TYPING_IDLE_MS = 3000;

/**
 * How long a receiver keeps showing someone as typing without hearing from them.
 *
 * The safety net for the case the "stopped" message never arrives — a closed
 * laptop, a dropped connection. Without it the indicator stays on forever,
 * which is worse than being a few seconds late to remove it.
 */
export const TYPING_EXPIRY_MS = 7000;

/**
 * Above this many people typing, the indicator counts instead of naming.
 *
 * Three names already overflow a narrow header, and by then who exactly is
 * typing has stopped being the useful part.
 */
export const MAX_NAMED_TYPERS = 2;

/** One shared empty map, so a hidden typing state does not hand consumers a new object every render. */
export const NO_TYPERS: Record<string, string[]> = {};
