import type { MessageTimerSeconds } from "@chatty/shared-types";
import { MESSAGE_TIMER_OPTIONS } from "@/constants/message-timers";
import type { RadioListOption } from "@/types/radio-list";

/** The disappearing-message choices in full words — a settings list has the room the chat chip lacks. */
export const DISAPPEARING_OPTIONS: RadioListOption<MessageTimerSeconds | null>[] = MESSAGE_TIMER_OPTIONS.map(
	(option) => ({ value: option.value, label: option.accessibleLabel ?? option.label }),
);
