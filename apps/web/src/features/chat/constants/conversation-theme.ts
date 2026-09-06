import type { ConversationTheme } from "@chatty/shared-types";

/**
 * Every class a "mine" surface needs, for one theme — the conversation's
 * shared accent, replacing the fixed `bg-block`/`text-block-ink` default.
 * Same reasoning as `constants/avatar-colors`: the tokens live in
 * `styles/globals.css`, and this is the only place that names them for this
 * feature, so a component never reaches for `bg-tint-*` directly.
 *
 * Every field is a complete, literal class string rather than one assembled
 * at runtime (`` `text-tint-${x}-ink/70` ``) — Tailwind finds utility classes
 * by scanning source text for them, so a class built from pieces at runtime
 * was never seen whole and never gets generated. This file being a scanned
 * source file is what makes `AVATAR_COLORS` work the same way already.
 *
 * See ADR 0022.
 */
interface ConversationThemeClasses {
	/** The bubble's own background/text pair. */
	bubble: string;
	bubbleInk: string;
	/** The voice player's round play button — inverted from the bubble for contrast. */
	control: string;
	/** Focus ring color for controls sitting on the bubble. */
	ring: string;
	/** Muted duration label. */
	faint: string;
	/** The waveform's unplayed portion. */
	unplayed: string;
	/** Text-only accent — the playback-rate button and error text. */
	accentText: string;
	/** A reacted-by-me reaction chip: filled disc, held on hover. */
	reacted: string;
}

const DEFAULT_THEME_CLASSES: ConversationThemeClasses = {
	bubble: "bg-block",
	bubbleInk: "text-block-ink",
	control: "bg-block-ink text-block hover:bg-block-ink hover:text-block focus-visible:ring-block-ink/40",
	ring: "focus-within:ring-block-ink/40",
	faint: "text-block-ink/70",
	unplayed: "text-block-ink/30",
	accentText: "text-block-ink hover:text-block-ink focus-visible:ring-block-ink/40",
	reacted: "bg-block text-block-ink hover:bg-block",
};

export const CONVERSATION_THEME_CLASSES: Record<ConversationTheme, ConversationThemeClasses> = {
	azure: {
		bubble: "bg-tint-azure",
		bubbleInk: "text-tint-azure-ink",
		control:
			"bg-tint-azure-ink text-tint-azure hover:bg-tint-azure-ink hover:text-tint-azure focus-visible:ring-tint-azure-ink/40",
		ring: "focus-within:ring-tint-azure-ink/40",
		faint: "text-tint-azure-ink/70",
		unplayed: "text-tint-azure-ink/30",
		accentText: "text-tint-azure-ink hover:text-tint-azure-ink focus-visible:ring-tint-azure-ink/40",
		reacted: "bg-tint-azure text-tint-azure-ink hover:bg-tint-azure",
	},
	amber: {
		bubble: "bg-tint-amber",
		bubbleInk: "text-tint-amber-ink",
		control:
			"bg-tint-amber-ink text-tint-amber hover:bg-tint-amber-ink hover:text-tint-amber focus-visible:ring-tint-amber-ink/40",
		ring: "focus-within:ring-tint-amber-ink/40",
		faint: "text-tint-amber-ink/70",
		unplayed: "text-tint-amber-ink/30",
		accentText: "text-tint-amber-ink hover:text-tint-amber-ink focus-visible:ring-tint-amber-ink/40",
		reacted: "bg-tint-amber text-tint-amber-ink hover:bg-tint-amber",
	},
	moss: {
		bubble: "bg-tint-moss",
		bubbleInk: "text-tint-moss-ink",
		control:
			"bg-tint-moss-ink text-tint-moss hover:bg-tint-moss-ink hover:text-tint-moss focus-visible:ring-tint-moss-ink/40",
		ring: "focus-within:ring-tint-moss-ink/40",
		faint: "text-tint-moss-ink/70",
		unplayed: "text-tint-moss-ink/30",
		accentText: "text-tint-moss-ink hover:text-tint-moss-ink focus-visible:ring-tint-moss-ink/40",
		reacted: "bg-tint-moss text-tint-moss-ink hover:bg-tint-moss",
	},
	plum: {
		bubble: "bg-tint-plum",
		bubbleInk: "text-tint-plum-ink",
		control:
			"bg-tint-plum-ink text-tint-plum hover:bg-tint-plum-ink hover:text-tint-plum focus-visible:ring-tint-plum-ink/40",
		ring: "focus-within:ring-tint-plum-ink/40",
		faint: "text-tint-plum-ink/70",
		unplayed: "text-tint-plum-ink/30",
		accentText: "text-tint-plum-ink hover:text-tint-plum-ink focus-visible:ring-tint-plum-ink/40",
		reacted: "bg-tint-plum text-tint-plum-ink hover:bg-tint-plum",
	},
	clay: {
		bubble: "bg-tint-clay",
		bubbleInk: "text-tint-clay-ink",
		control:
			"bg-tint-clay-ink text-tint-clay hover:bg-tint-clay-ink hover:text-tint-clay focus-visible:ring-tint-clay-ink/40",
		ring: "focus-within:ring-tint-clay-ink/40",
		faint: "text-tint-clay-ink/70",
		unplayed: "text-tint-clay-ink/30",
		accentText: "text-tint-clay-ink hover:text-tint-clay-ink focus-visible:ring-tint-clay-ink/40",
		reacted: "bg-tint-clay text-tint-clay-ink hover:bg-tint-clay",
	},
	teal: {
		bubble: "bg-tint-teal",
		bubbleInk: "text-tint-teal-ink",
		control:
			"bg-tint-teal-ink text-tint-teal hover:bg-tint-teal-ink hover:text-tint-teal focus-visible:ring-tint-teal-ink/40",
		ring: "focus-within:ring-tint-teal-ink/40",
		faint: "text-tint-teal-ink/70",
		unplayed: "text-tint-teal-ink/30",
		accentText: "text-tint-teal-ink hover:text-tint-teal-ink focus-visible:ring-tint-teal-ink/40",
		reacted: "bg-tint-teal text-tint-teal-ink hover:bg-tint-teal",
	},
	iris: {
		bubble: "bg-tint-iris",
		bubbleInk: "text-tint-iris-ink",
		control:
			"bg-tint-iris-ink text-tint-iris hover:bg-tint-iris-ink hover:text-tint-iris focus-visible:ring-tint-iris-ink/40",
		ring: "focus-within:ring-tint-iris-ink/40",
		faint: "text-tint-iris-ink/70",
		unplayed: "text-tint-iris-ink/30",
		accentText: "text-tint-iris-ink hover:text-tint-iris-ink focus-visible:ring-tint-iris-ink/40",
		reacted: "bg-tint-iris text-tint-iris-ink hover:bg-tint-iris",
	},
	fern: {
		bubble: "bg-tint-fern",
		bubbleInk: "text-tint-fern-ink",
		control:
			"bg-tint-fern-ink text-tint-fern hover:bg-tint-fern-ink hover:text-tint-fern focus-visible:ring-tint-fern-ink/40",
		ring: "focus-within:ring-tint-fern-ink/40",
		faint: "text-tint-fern-ink/70",
		unplayed: "text-tint-fern-ink/30",
		accentText: "text-tint-fern-ink hover:text-tint-fern-ink focus-visible:ring-tint-fern-ink/40",
		reacted: "bg-tint-fern text-tint-fern-ink hover:bg-tint-fern",
	},
};

/** Resolves null (no theme set) to today's fixed appearance. */
export function getConversationThemeClasses(theme: ConversationTheme | null): ConversationThemeClasses {
	return theme ? CONVERSATION_THEME_CLASSES[theme] : DEFAULT_THEME_CLASSES;
}

export const CONVERSATION_THEME_OPTIONS: { value: ConversationTheme; label: string }[] = [
	{ value: "azure", label: "Azure" },
	{ value: "amber", label: "Amber" },
	{ value: "moss", label: "Moss" },
	{ value: "plum", label: "Plum" },
	{ value: "clay", label: "Clay" },
	{ value: "teal", label: "Teal" },
	{ value: "iris", label: "Iris" },
	{ value: "fern", label: "Fern" },
];
