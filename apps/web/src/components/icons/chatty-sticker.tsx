import type { BuiltinStickerKey } from "@chatty/shared-types";
import type { CSSProperties } from "react";
import { CHATTY_STICKER_INK, CHATTY_STICKER_MOODS } from "@/constants/chatty-sticker-moods";
import { cn } from "@/utils/cn";

interface ChattyStickerProps {
	sticker: BuiltinStickerKey;
	className?: string;
	style?: CSSProperties;
}

/**
 * One of Chatty's built-in stickers: the logo's bubble-with-eyes in a mood,
 * moving in CSS (`stickers.css`) — so it costs no download, plays in any theme,
 * and stops under reduced motion or while off screen.
 */
export function ChattySticker({ sticker, className, style }: ChattyStickerProps) {
	const mood = CHATTY_STICKER_MOODS[sticker];

	return (
		<svg
			aria-hidden="true"
			viewBox="0 -8 128 128"
			overflow="visible"
			className={cn("chatty-sticker", className)}
			style={style}
		>
			<g className="sticker-body">
				<path
					d="M24 30c0-8 6-14 14-14h52c8 0 14 6 14 14v40c0 8-6 14-14 14H62l-18 16c-2 1.5-4 .5-4-2V84h-2c-8 0-14-6-14-14z"
					fill={mood.fill}
					stroke={CHATTY_STICKER_INK}
					strokeWidth="4"
					strokeLinejoin="round"
				/>
				<path d="M34 28c2-5 6-7 11-7" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
				{mood.face}
			</g>
			{mood.extra}
		</svg>
	);
}
