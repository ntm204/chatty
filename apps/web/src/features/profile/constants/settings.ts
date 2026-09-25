import { Ban, Bell, CircleUserRound, EyeOff, Lock, Mail, Palette, TriangleAlert } from "lucide-react";
import type { SettingsNavigationItem } from "../types/settings";

/**
 * The categories, in the order somebody is likely to want them.
 *
 * "Password" rather than "Security" and "Delete account" rather than "Danger
 * zone": both of the old names described a *kind* of setting, and a nav row is
 * more useful when it names the thing it will let you do.
 */
export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
	{
		id: "profile",
		label: "Profile",
		icon: CircleUserRound,
	},
	{
		id: "blocked",
		label: "Blocked users",
		icon: Ban,
	},
	{
		id: "restricted",
		label: "Restricted people",
		icon: EyeOff,
	},
	{
		id: "appearance",
		label: "Appearance",
		icon: Palette,
	},
	{
		id: "email",
		label: "Email",
		icon: Mail,
	},
	{
		id: "notifications",
		label: "Notifications",
		icon: Bell,
	},
	{
		id: "security",
		label: "Password",
		icon: Lock,
	},
	{
		id: "danger",
		label: "Delete account",
		icon: TriangleAlert,
		isDestructive: true,
	},
];
