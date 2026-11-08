import { Monitor, Moon, Sun } from "lucide-react";
import type { PaletteId, PaletteOption, ThemeOption } from "@/types/theme";

/**
 * Where the per-device theme choice is kept.
 *
 * `localStorage`, not the account, for the same reason the notification
 * preference is (see `constants/notifications`): a theme is a property of the
 * screen you are looking at. A laptop at a desk and a phone at night are not
 * asking for the same answer, and syncing one would overwrite the other.
 *
 * **The literal is duplicated in `apps/web/public/theme.js`**, which runs before
 * the bundle exists and so cannot import this. Changing it here means changing
 * it there in the same commit.
 */
export const THEME_STORAGE_KEY = "chatty:theme";

/** The media query the "system" preference resolves against, in one place. */
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * The three choices, in the order they are offered.
 *
 * System last rather than first, even though it is the default. The two
 * concrete answers are what someone opening this panel came to pick between;
 * "follow the OS" is the thing you go back to, and a list reads better when the
 * escape hatch is at the bottom.
 */
export const THEME_OPTIONS: ThemeOption[] = [
	{ id: "light", label: "Light", description: "Bright paper, all day.", icon: Sun },
	{ id: "system", label: "System", description: "Follows this device.", icon: Monitor },
	{ id: "dark", label: "Dark", description: "Easy on the eyes at night.", icon: Moon },
];

/** `public/theme.js` stamps `data-palette` from the same key; the two must not drift. */
export const PALETTE_STORAGE_KEY = "chatty:palette";

export const DEFAULT_PALETTE: PaletteId = "ink";

/**
 * The colour families on offer — each a complete light and dark pair defined in
 * `styles/palettes.css`. The preview colours repeat a few of those values
 * because a card has to show a palette that is not the one applied; keep them
 * in step when a palette changes.
 *
 * Descriptions avoid the words Light, Dark and System, which name the mode
 * radios on the same page.
 */
export const PALETTE_OPTIONS: PaletteOption[] = [
	{
		id: "ink",
		label: "Ink & pastel",
		description: "Warm paper, iris bubbles.",
		preview: {
			light: {
				page: "#fffdf8",
				panel: "#f2efe8",
				incoming: "#f2eee5",
				mine: "#d9cff5",
				ink: "#171743",
				accent: "#fbc80b",
			},
			dark: {
				page: "#1b1a2c",
				panel: "#100f1c",
				incoming: "#29273d",
				mine: "#4b4180",
				ink: "#f2f1ff",
				accent: "#fbc80b",
			},
		},
	},
	{
		id: "clay",
		label: "Clay",
		description: "Cream and terracotta.",
		preview: {
			light: {
				page: "#faf9f5",
				panel: "#f0eee6",
				incoming: "#f0eee6",
				mine: "#f1dccd",
				ink: "#141413",
				accent: "#d97757",
			},
			dark: {
				page: "#262624",
				panel: "#1f1e1d",
				incoming: "#3a3936",
				mine: "#57392c",
				ink: "#faf9f5",
				accent: "#d97757",
			},
		},
	},
	{
		id: "ocean",
		label: "Ocean",
		description: "Clear blues, crisp and calm.",
		preview: {
			light: {
				page: "#ffffff",
				panel: "#eef3f8",
				incoming: "#e9f0f7",
				mine: "#cfe4f7",
				ink: "#10243b",
				accent: "#2f80ed",
			},
			dark: {
				page: "#131d30",
				panel: "#0b1220",
				incoming: "#1c2940",
				mine: "#1f4a7a",
				ink: "#eaf2ff",
				accent: "#4c9aff",
			},
		},
	},
	{
		id: "forest",
		label: "Forest",
		description: "Moss, fern and soft sage.",
		preview: {
			light: {
				page: "#fdfefb",
				panel: "#eef2ea",
				incoming: "#e9efe2",
				mine: "#d6e7c7",
				ink: "#1d2a1b",
				accent: "#3f7d4a",
			},
			dark: {
				page: "#18221a",
				panel: "#0f150f",
				incoming: "#223024",
				mine: "#2f4a30",
				ink: "#eef5ea",
				accent: "#6fbf73",
			},
		},
	},
	{
		id: "mono",
		label: "Graphite",
		description: "No colour, just contrast.",
		preview: {
			light: {
				page: "#ffffff",
				panel: "#f1f1f1",
				incoming: "#ededed",
				mine: "#e2e2e2",
				ink: "#111111",
				accent: "#111111",
			},
			dark: {
				page: "#1a1a1a",
				panel: "#0c0c0c",
				incoming: "#262626",
				mine: "#3a3a3a",
				ink: "#f2f2f2",
				accent: "#f2f2f2",
			},
		},
	},
];
