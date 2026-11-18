import type { WallpaperKey, WallpaperSet } from "../types/theme";

/**
 * The flowing wallpaper behind each conversation theme — see `FlowingWallpaper`.
 *
 * Day sets are pastel, because the whole gradient is visible behind the
 * messages. Night sets are vivid, because at night the page is near-black and
 * the gradient only shows through the doodle pattern's lines, as Telegram does.
 *
 * Hex rather than tokens: these are painted per pixel on a canvas, which cannot
 * read CSS custom properties.
 */
export const CHAT_WALLPAPERS: Record<WallpaperKey, WallpaperSet> = {
	// Telegram's "classic" day colours — sage, meadow, straw, moss — and its night set of peach, rose,
	// violet and indigo, the backgrounds people know a chat app by.
	default: {
		light: ["#dbddbb", "#6ba587", "#d5d88d", "#88b884"],
		dark: ["#fec496", "#dd6cb9", "#962fbf", "#4f5bd5"],
	},
	azure: { light: ["#bfe0f8", "#a9d4f0", "#dbeefc", "#b7c9f5"], dark: ["#4fa3ff", "#38c6ff", "#7d8cff", "#2ee6d6"] },
	amber: { light: ["#fbe0a0", "#f8cf8a", "#fdf0c4", "#f6d3a6"], dark: ["#ffc65c", "#ff9f45", "#ffd98a", "#f27d52"] },
	moss: { light: ["#d3e8bc", "#bfe0c8", "#eaf2cf", "#c7e3d6"], dark: ["#6fd38f", "#b8e05a", "#3fc1a5", "#8fd36f"] },
	plum: { light: ["#f7c9da", "#f2b9d0", "#fbe1ea", "#e6c8f0"], dark: ["#ff7eb6", "#c58bff", "#ff9fcf", "#e86bd0"] },
	clay: { light: ["#f8cdb6", "#f4b9a0", "#fbe3d2", "#f3cfae"], dark: ["#ff8a5c", "#ffb36b", "#ff6e7a", "#f2a65a"] },
	teal: { light: ["#b5e3d8", "#a3d9e0", "#d3f0e8", "#b8d8ee"], dark: ["#2ee6d6", "#3ddc97", "#38b6ff", "#5ad6c0"] },
	iris: { light: ["#d9cdf6", "#c9bdf2", "#e9e1fb", "#cfd2f6"], dark: ["#9b8cff", "#b46cff", "#7d8cff", "#c8a8ff"] },
	fern: { light: ["#e0ebaa", "#cfe39c", "#eef4c8", "#d6e8b8"], dark: ["#c4e35a", "#8fd36f", "#e6d45a", "#6fcf8a"] },
};

/** Small on purpose: the browser's smoothing upscales it into a soft gradient. */
export const WALLPAPER_CANVAS_WIDTH = 50;
export const WALLPAPER_CANVAS_HEIGHT = 66;

/** How long the colours take to travel one step after a message is sent. */
export const WALLPAPER_FLOW_MS = 650;
