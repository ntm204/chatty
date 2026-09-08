import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeOption } from "@/types/theme";

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
	{ id: "light", label: "Light", description: "Fresh whites, deep blue and a little sunshine.", icon: Sun },
	{ id: "dark", label: "Dark", description: "Midnight blue, soft violet and a warmer glow.", icon: Moon },
	{ id: "system", label: "System", description: "Follow this device, and change when it does.", icon: Monitor },
];
