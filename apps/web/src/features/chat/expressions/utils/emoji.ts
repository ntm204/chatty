import { EMOJI_CATEGORIES } from "../constants/emoji";
import type { EmojiEntry } from "../types/emoji";
import { foldSearchText } from "../../utils/fold-search-text";

/**
 * How many emoji a message may be and still be drawn large.
 *
 * Three. Past that the glyphs stop being a gesture and start being a sentence,
 * and a sentence wants the bubble that says who is speaking.
 */
const MAX_JUMBO_EMOJI = 3;

/**
 * Whether a message is nothing but a few emoji.
 *
 * Matched with `\p{Extended_Pictographic}` and the joiners around it rather
 * than a hand-written range: an emoji is regularly several code points — a flag
 * is two regional indicators, a family is four people and three zero-width
 * joiners, and a heart is a heart plus a variation selector. Counting code
 * points would call one flag two emoji and refuse to enlarge it.
 *
 * Whitespace is stripped first so "😀 😀" counts as two rather than failing on
 * the space between them.
 */
export function countJumboEmoji(content: string): number {
	const stripped = content.replace(/\s/gu, "");
	if (!stripped) return 0;

	const clusters = stripped.match(
		/\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}/gu,
	);
	if (!clusters) return 0;

	// Every cluster matched has to account for the whole string, or there is text
	// mixed in and this is an ordinary message.
	const isOnlyEmoji = clusters.join("") === stripped;

	return isOnlyEmoji && clusters.length <= MAX_JUMBO_EMOJI ? clusters.length : 0;
}

/**
 * Every emoji whose keywords contain the query, across all categories.
 *
 * Substring rather than prefix, because the useful searches are not the start
 * of a word — "cry" should find `keywords: "sob cry loud khoc"`. Case is folded
 * once on the query rather than per entry: the data is written lowercase and
 * that is a property of the file, not something to re-derive a few hundred
 * times per keystroke.
 *
 * Each word is matched on its own, so "trái tim" and "heart red" both work
 * whatever order the keywords were written in.
 */
export function searchEmoji(query: string): EmojiEntry[] {
	const needle = foldSearchText(query.trim());
	if (!needle) return [];

	const words = needle.split(/\s+/u);

	return EMOJI_CATEGORIES.flatMap((category) =>
		category.emoji.filter((entry) => {
			const keywords = foldSearchText(entry.keywords);

			return words.every((word) => keywords.includes(word)) || entry.char === query.trim();
		}),
	);
}
