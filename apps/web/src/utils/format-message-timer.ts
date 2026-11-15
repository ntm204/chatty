import type { MessageTimerSeconds } from "@chatty/shared-types";
import { MESSAGE_TIMER_OPTIONS } from "@/constants/message-timers";

/** "24 hours", "7 days" — for sentences and accessible names. */
export function formatMessageTimer(seconds: MessageTimerSeconds): string {
	const days = seconds / 86_400;

	return days === 1 ? "24 hours" : `${String(days)} days`;
}

/** "24h", "7d" — the compact label the timer was offered under, for chrome. */
export function formatMessageTimerShort(seconds: MessageTimerSeconds): string {
	return MESSAGE_TIMER_OPTIONS.find((option) => option.value === seconds)?.label ?? formatMessageTimer(seconds);
}
