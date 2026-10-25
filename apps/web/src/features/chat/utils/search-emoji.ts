import { EMOJI_CATEGORIES } from "../constants/emoji";
import type { EmojiEntry } from "../types/emoji";
import { foldSearchText } from "./fold-search-text";

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
