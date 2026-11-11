import type { LucideIcon } from "lucide-react";

/**
 * One emoji, and the words somebody might look for it by.
 *
 * `keywords` is a single space-separated string rather than an array: it is
 * only ever `includes`-searched, and a few hundred short strings cost less to
 * parse and to hold than a few hundred arrays.
 */
export interface EmojiEntry {
	char: string;
	keywords: string;
}

export interface EmojiCategory {
	id: string;
	/** Announced by the tab; the tab itself is only an icon. */
	label: string;
	Icon: LucideIcon;
	emoji: EmojiEntry[];
}
