import type { LucideIcon } from "lucide-react";

/**
 * What the reader chose. Three values, not two — "system" is a standing
 * instruction to follow the OS, which is a different fact from either of the
 * concrete themes and cannot be stored as one.
 */
export type ThemePreference = "light" | "dark" | "system";

/** What the preference resolves to, and the only thing `data-theme` ever holds. */
export type ResolvedTheme = "light" | "dark";

/**
 * One row of the Appearance setting.
 *
 * Here rather than beside the constant it types, per the frontend conventions:
 * a type a constant is keyed on outlives the constant.
 */
export interface ThemeOption {
	id: ThemePreference;
	label: string;
	description: string;
	icon: LucideIcon;
}

/**
 * Which colour family the app is painted in, independent of light or dark.
 * Stamped on `<html>` as `data-palette`; "ink" is the base palette in
 * `globals.css` and needs no overrides.
 */
export type PaletteId = "ink" | "clay" | "ocean" | "forest" | "mono";

/** The handful of colours a palette preview draws: a page, two bubbles and the call to action. */
export interface PalettePreviewColors {
	page: string;
	panel: string;
	incoming: string;
	mine: string;
	ink: string;
	accent: string;
}

/** One card of the Appearance palette picker. */
export interface PaletteOption {
	id: PaletteId;
	label: string;
	description: string;
	preview: Record<ResolvedTheme, PalettePreviewColors>;
}
