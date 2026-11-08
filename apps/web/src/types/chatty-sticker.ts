import type { ReactNode } from "react";

/** One mood of a built-in sticker, drawn by `ChattySticker`. */
export interface ChattyStickerMood {
	fill: string;
	face: ReactNode;
	extra?: ReactNode;
}
