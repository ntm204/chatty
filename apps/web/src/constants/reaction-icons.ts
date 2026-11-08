import type { ReactionEmoji } from "@chatty/shared-types";
import type { ReactionIconShape } from "@/types/reaction-icon";

/**
 * Chatty's own drawings for the six quick reactions — see `ReactionIcon`.
 *
 * Each is a pastel bubble printed a little off its ink line, a white shine, and
 * a loose hand-drawn glyph, in the style of icon sets like Icons8's "Bubbles"
 * but drawn here from scratch: the files are ours to ship under the repo's
 * licence. Colours are `--color-sticker-*` tokens, fixed in both themes.
 *
 * Data rather than JSX so the renderer stays one small component and the
 * drawings can be reviewed as coordinates. Any emoji not listed here keeps the
 * system glyph.
 */
const INK = "var(--color-sticker-ink)";
const SHINE: ReactionIconShape = {
	kind: "path",
	d: "M8.4 9.3c.9-1.5 2.4-2.6 4-3.1",
	fill: "none",
	stroke: "var(--color-sticker-paper)",
	strokeWidth: 1.6,
};
const face = (fill: string): ReactionIconShape[] => [
	{ kind: "circle", cx: 17, cy: 17, r: 13, fill },
	{ kind: "circle", cx: 16, cy: 16, r: 12.2, fill: "none", stroke: INK, strokeWidth: 1.7 },
];

export const REACTION_ICONS: Partial<Record<ReactionEmoji, ReactionIconShape[]>> = {
	"❤️": [
		{ kind: "circle", cx: 17, cy: 17, r: 13, fill: "var(--color-sticker-plum)" },
		{
			kind: "path",
			d: "M16 26.2c-.6-.5-9.2-6.4-9.6-12.1-.3-3.4 2.1-5.9 5-5.8 2.1.1 3.6 1.4 4.6 3.1 1-1.8 2.6-3.1 4.8-3.2 2.9-.1 5 2.4 4.7 5.7-.5 5.9-8.9 11.8-9.5 12.3z",
			fill: "var(--color-sticker-heart)",
			stroke: INK,
			strokeWidth: 1.7,
		},
		{ ...SHINE, d: "M10.2 12.6c.2-1.3 1-2.1 2.1-2.3" },
	],
	"😂": [
		...face("var(--color-sticker-amber)"),
		{
			kind: "path",
			d: "M9.6 13.6c.8-1.5 2.6-1.6 3.5-.1M18.6 13.5c.9-1.5 2.7-1.4 3.5.1",
			fill: "none",
			stroke: INK,
			strokeWidth: 1.7,
		},
		{
			kind: "path",
			d: "M9.4 17.6c.2 3.9 3.1 6.4 6.7 6.4 3.6 0 6.4-2.6 6.5-6.5-4.4.6-8.8.7-13.2.1z",
			fill: INK,
			stroke: INK,
			strokeWidth: 1.5,
		},
		{
			kind: "path",
			d: "M12.6 22.2c1.9-1.4 4.8-1.4 6.8 0-1.9 1.4-4.9 1.4-6.8 0z",
			fill: "var(--color-sticker-heart)",
		},
		SHINE,
	],
	"😮": [
		...face("var(--color-sticker-iris)"),
		{
			kind: "path",
			d: "M10 11.2c.9-.9 2.1-1.2 3.2-.9M19 10.4c1.1-.3 2.3 0 3.1.9",
			fill: "none",
			stroke: INK,
			strokeWidth: 1.6,
		},
		{ kind: "circle", cx: 12, cy: 14.6, r: 1.5, fill: INK },
		{ kind: "circle", cx: 20.2, cy: 14.4, r: 1.5, fill: INK },
		{ kind: "ellipse", cx: 16.2, cy: 21.4, rx: 2.6, ry: 3.2, fill: INK },
		SHINE,
	],
	"😢": [
		...face("var(--color-sticker-azure)"),
		{
			kind: "path",
			d: "M9.8 12.4c1.2.2 2.4-.3 3.1-1.2M22.4 12.3c-1.2.2-2.4-.2-3.1-1.1",
			fill: "none",
			stroke: INK,
			strokeWidth: 1.6,
		},
		{ kind: "circle", cx: 12.1, cy: 15.4, r: 1.45, fill: INK },
		{ kind: "circle", cx: 20.1, cy: 15.3, r: 1.45, fill: INK },
		{ kind: "path", d: "M12.2 22.4c2.4-2.3 5.4-2.3 7.7 0", fill: "none", stroke: INK, strokeWidth: 1.7 },
		{
			kind: "path",
			d: "M22.6 17.4c1.4 1.9 2.2 3.2 2.2 4.2 0 1.2-1 2.1-2.2 2.1s-2.2-.9-2.2-2.1c0-1 .8-2.3 2.2-4.2z",
			fill: "var(--color-sticker-tear)",
			stroke: INK,
			strokeWidth: 1.3,
		},
		SHINE,
	],
	"😡": [
		...face("var(--color-sticker-clay)"),
		{ kind: "path", d: "M9.4 11.4l4.2 2.1M22.6 11.3l-4.2 2.2", fill: "none", stroke: INK, strokeWidth: 1.8 },
		{ kind: "circle", cx: 12.3, cy: 16, r: 1.45, fill: INK },
		{ kind: "circle", cx: 19.8, cy: 16, r: 1.45, fill: INK },
		{
			kind: "path",
			d: "M12.4 22.3c1.1-1 2.3-1.4 3.6-1.4 1.4 0 2.6.5 3.7 1.5",
			fill: "none",
			stroke: INK,
			strokeWidth: 1.7,
		},
		{
			kind: "path",
			d: "M23.5 5.6l1.1 2.3M26.6 7.4l-2.2 1.2",
			fill: "none",
			stroke: "var(--color-sticker-steam)",
			strokeWidth: 1.6,
		},
		SHINE,
	],
	"👍": [
		{ kind: "circle", cx: 17, cy: 17, r: 13, fill: "var(--color-sticker-moss)" },
		{
			kind: "path",
			d: "M7.4 14.6h3.9v10.1H7.4c-.6 0-1-.4-1-1v-8.1c0-.6.4-1 1-1z",
			fill: "var(--color-sticker-paper)",
			stroke: INK,
			strokeWidth: 1.7,
		},
		{
			kind: "path",
			d: "M11.3 14.6l3.6-6.1c.5-.9 1.7-1.1 2.4-.4.6.5.8 1.3.6 2l-1 3.6h5.4c1.5 0 2.6 1.4 2.2 2.9l-1.7 6.2c-.3 1.2-1.4 2-2.6 2h-8.9",
			fill: "var(--color-sticker-thumb)",
			stroke: INK,
			strokeWidth: 1.7,
		},
		{ kind: "path", d: "M18.3 17.1h3.4M17.9 20.4h3", fill: "none", stroke: INK, strokeWidth: 1.3, opacity: 0.55 },
	],
};
