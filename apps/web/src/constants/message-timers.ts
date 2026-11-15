import type { MessageTimerSeconds } from "@chatty/shared-types";

export interface MessageTimerOption {
	value: MessageTimerSeconds | null;
	label: string;
	accessibleLabel?: string;
}

/** The disappearing-message choices, in the order offered. The server accepts exactly these. */
export const MESSAGE_TIMER_OPTIONS: MessageTimerOption[] = [
	{ value: null, label: "Off" },
	{ value: 86_400, label: "24h", accessibleLabel: "24 hours" },
	{ value: 604_800, label: "7d", accessibleLabel: "7 days" },
	{ value: 7_776_000, label: "90d", accessibleLabel: "90 days" },
];
