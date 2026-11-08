import type { BuiltinStickerKey } from "@chatty/shared-types";
import type { ChattyStickerMood } from "@/types/chatty-sticker";

export const CHATTY_STICKER_INK = "var(--color-sticker-ink)";
const EYES = (
	<>
		<ellipse cx="52" cy="48" rx="5" ry="7" fill={CHATTY_STICKER_INK} />
		<ellipse cx="76" cy="48" rx="5" ry="7" fill={CHATTY_STICKER_INK} />
		<circle cx="53.5" cy="45" r="1.8" fill="white" />
		<circle cx="77.5" cy="45" r="1.8" fill="white" />
	</>
);
const SMILE = (
	<path d="M54 63c6 6 14 6 20 0" stroke={CHATTY_STICKER_INK} strokeWidth="4" strokeLinecap="round" fill="none" />
);

/** The parts of each mood: the face inside the bubble, and anything around it. */
/** Each mood of the built-in sticker: the bubble's fill, its face, and anything around it. */
export const CHATTY_STICKER_MOODS: Record<BuiltinStickerKey, ChattyStickerMood> = {
	wave: {
		fill: "var(--color-sticker-azure)",
		face: (
			<>
				{EYES}
				{SMILE}
			</>
		),
		extra: (
			<path
				className="sticker-hand"
				d="M98 78c6-4 10-12 8-20-1-4 4-5 6-1 3 7 1 18-6 25"
				fill="var(--color-sticker-amber)"
				stroke={CHATTY_STICKER_INK}
				strokeWidth="4"
				strokeLinejoin="round"
			/>
		),
	},
	love: {
		fill: "var(--color-sticker-plum)",
		face: (
			<>
				<path
					d="M46 47c3-4 9-4 11 0M70 47c3-4 9-4 11 0"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinecap="round"
					fill="none"
				/>
				{SMILE}
			</>
		),
		extra: (
			<path
				className="sticker-heart"
				d="M64 112c-2-2-22-14-22-27 0-7 5-11 11-11 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 4 11 11 0 13-20 25-22 27z"
				fill="var(--color-sticker-heart)"
				stroke={CHATTY_STICKER_INK}
				strokeWidth="4"
				strokeLinejoin="round"
			/>
		),
	},
	lol: {
		fill: "var(--color-sticker-amber)",
		face: (
			<>
				<path
					d="M44 46l10 4-10 4M84 46l-10 4 10 4"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
				<path d="M48 60h32c0 10-7 16-16 16s-16-6-16-16z" fill={CHATTY_STICKER_INK} />
			</>
		),
		extra: (
			<>
				<path
					className="sticker-drip"
					d="M36 50c-3 4-4 7-4 9a4 4 0 0 0 8 0c0-2-1-5-4-9z"
					fill="var(--color-sticker-tear)"
				/>
				<path
					className="sticker-drip"
					d="M92 50c-3 4-4 7-4 9a4 4 0 0 0 8 0c0-2-1-5-4-9z"
					fill="var(--color-sticker-tear)"
				/>
			</>
		),
	},
	wow: {
		fill: "var(--color-sticker-iris)",
		face: (
			<>
				<circle cx="52" cy="46" r="9" fill="white" stroke={CHATTY_STICKER_INK} strokeWidth="3.5" />
				<circle cx="76" cy="46" r="9" fill="white" stroke={CHATTY_STICKER_INK} strokeWidth="3.5" />
				<circle cx="53" cy="47" r="4" fill={CHATTY_STICKER_INK} />
				<circle cx="77" cy="47" r="4" fill={CHATTY_STICKER_INK} />
				<ellipse cx="64" cy="68" rx="6" ry="8" fill={CHATTY_STICKER_INK} />
			</>
		),
	},
	sad: {
		fill: "var(--color-sticker-azure)",
		face: (
			<>
				<path d="M44 40l10 4M84 40l-10 4" stroke={CHATTY_STICKER_INK} strokeWidth="4" strokeLinecap="round" />
				{EYES}
				<path
					d="M54 70c6-6 14-6 20 0"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinecap="round"
					fill="none"
				/>
			</>
		),
		extra: (
			<path
				className="sticker-drip"
				d="M84 58c-3 5-5 8-5 10a5 5 0 0 0 10 0c0-2-2-5-5-10z"
				fill="var(--color-sticker-tear)"
				stroke={CHATTY_STICKER_INK}
				strokeWidth="2.5"
			/>
		),
	},
	sleep: {
		fill: "var(--color-sticker-moss)",
		face: (
			<>
				<path
					d="M45 49c3 3 9 3 12 0M71 49c3 3 9 3 12 0"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinecap="round"
					fill="none"
				/>
				<ellipse cx="64" cy="66" rx="4" ry="3" fill={CHATTY_STICKER_INK} />
			</>
		),
		extra: (
			<g fill={CHATTY_STICKER_INK} fontWeight="800" fontFamily="system-ui, sans-serif">
				<text className="sticker-z" x="94" y="34" fontSize="16">
					z
				</text>
				<text className="sticker-z" x="100" y="26" fontSize="20">
					z
				</text>
				<text className="sticker-z" x="108" y="16" fontSize="24">
					Z
				</text>
			</g>
		),
	},
	party: {
		fill: "var(--color-sticker-clay)",
		face: (
			<>
				{EYES}
				<path d="M50 62h28c0 8-6 13-14 13s-14-5-14-13z" fill={CHATTY_STICKER_INK} />
			</>
		),
		extra: (
			<>
				<path
					className="sticker-hat"
					d="M52 18l12-20 12 20z"
					fill="var(--color-sticker-thumb)"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinejoin="round"
				/>
				<rect
					className="sticker-confetti"
					x="16"
					y="20"
					width="6"
					height="10"
					rx="2"
					fill="var(--color-sticker-tear)"
				/>
				<rect
					className="sticker-confetti"
					x="108"
					y="18"
					width="6"
					height="10"
					rx="2"
					fill="var(--color-sticker-heart)"
				/>
				<circle className="sticker-confetti" cx="20" cy="60" r="4" fill="var(--color-sticker-thumb)" />
				<circle className="sticker-confetti" cx="112" cy="56" r="4" fill="var(--color-sticker-moss)" />
			</>
		),
	},
	ok: {
		fill: "var(--color-sticker-moss)",
		face: (
			<>
				{EYES}
				{SMILE}
			</>
		),
		extra: (
			<g className="sticker-thumb">
				<path
					d="M84 86h8v24h-8z"
					fill="white"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinejoin="round"
				/>
				<path
					d="M92 86l8-14c2-3 6-3 7 0 1 2 1 4 0 6l-2 8h11c4 0 6 3 5 6l-4 14c-1 3-3 4-6 4H92"
					fill="var(--color-sticker-thumb)"
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinejoin="round"
				/>
			</g>
		),
	},
};
