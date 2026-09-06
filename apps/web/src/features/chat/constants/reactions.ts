import type { ReactionEmoji } from "@chatty/shared-types";

/**
 * The six the quick row offers, in the order it offers them.
 *
 * These six rather than any six: they are what Messenger, Instagram and Telegram
 * all put in the same bar, so the row is recognised before it is read. The heart
 * is first because it is what the overwhelming majority of reactions are.
 *
 * It is a *shortcut*, not the set — `+` opens the full picker and any emoji the
 * server accepts is a reaction. That is the difference from the five-name enum
 * this replaced, and the reason the row can be this short.
 */
export const QUICK_REACTIONS: ReactionEmoji[] = ["❤️", "😂", "😮", "😢", "😡", "👍"];

/**
 * How many distinct emoji a message shows before the rest collapse into one
 * chip.
 *
 * Three, and the number is doing real work now that the set is open: a group of
 * thirty can put thirty different emoji on one sentence, and thirty chips would
 * be wider than the bubble they hang off. The overflow chip opens the list,
 * which is where a reaction that did not fit is still readable.
 */
export const REACTION_CHIP_LIMIT = 3;
