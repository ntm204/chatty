import type { ConversationTheme } from "@chatty/shared-types";
import type { ResolvedTheme } from "@/types/theme";

/** A conversation's theme, or "default" for one that never chose. */
export type WallpaperKey = ConversationTheme | "default";

/** Four hex colours: the points the flowing gradient blends between. */
export type WallpaperColours = [string, string, string, string];

export type WallpaperSet = Record<ResolvedTheme, WallpaperColours>;

/** Which device the chat theme picker draws its live preview on. */
export type PreviewDevice = "phone" | "desktop";

/** One bubble in the theme picker's sample conversation. */
export interface PreviewMessage {
	id: number;
	text: string;
	isMine: boolean;
}
