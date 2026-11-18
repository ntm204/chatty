import type { LucideIcon } from "lucide-react";

export type SettingsSection = "profile" | "privacy" | "appearance" | "email" | "notifications" | "security" | "danger";

/** A page inside Privacy, Instagram-style: the list is the menu, each row opens one of these. */
export type PrivacyPage =
	| "active_status"
	| "read_receipts"
	| "typing"
	| "sharing"
	| "disappearing"
	| "close_friends"
	| "hidden"
	| "restricted"
	| "blocked";

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
	/** Whether a divider rule should be drawn beneath this item. */
	hasDividerAfter?: boolean;
	/**
	 * Set on the one row that ends an account. It is drawn in the signal colour
	 * and separated by a rule — the only place in the nav either happens.
	 */
	isDestructive?: boolean;
}
