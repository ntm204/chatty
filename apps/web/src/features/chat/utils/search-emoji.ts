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
 */
export function searchEmoji(query: string): EmojiEntry[] {
	const needle = foldSearchText(query.trim());
	if (!needle) return [];

	return EMOJI_CATEGORIES.flatMap((category) =>
		category.emoji.filter(
			(entry) => foldSearchText(entry.keywords).includes(needle) || entry.char === query.trim(),
		),
	);
}
