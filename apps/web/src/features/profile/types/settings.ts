import type { LucideIcon } from "lucide-react";

export type SettingsSection =
	"profile" | "blocked" | "restricted" | "appearance" | "email" | "notifications" | "security" | "danger";

/**
 * One row of the settings dialog's left-hand nav, and the heading it opens.
 *
 * Here rather than beside the constant it types, per the frontend conventions:
 * a type a constant is keyed on outlives the constant, and the settings dialog
 * reads `label` for its own header from the same row.
 */
export interface SettingsNavigationItem {
	id: SettingsSection;
	label: string;
	icon: LucideIcon;
	/**
	 * Set on the one row that ends an account. It is drawn in the signal colour
	 * and separated by a rule — the only place in the nav either happens.
	 */
	isDestructive?: boolean;
}
