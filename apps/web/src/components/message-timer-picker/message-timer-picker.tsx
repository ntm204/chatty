import type { MessageTimerSeconds } from "@chatty/shared-types";
import { SegmentedControl } from "@/components/segmented-control";
import { MESSAGE_TIMER_OPTIONS } from "@/constants/message-timers";

interface MessageTimerPickerProps {
	value: MessageTimerSeconds | null;
	onChange: (value: MessageTimerSeconds | null) => void;
	isDisabled?: boolean;
	/** The id of the visible label this group answers to. */
	labelledBy: string;
}

/**
 * The disappearing-message choices, shared by a chat's own setting and the
 * account default so both offer the same words in the same order — the order
 * of the server's preset list.
 */
export function MessageTimerPicker({ value, onChange, isDisabled = false, labelledBy }: MessageTimerPickerProps) {
	return (
		<SegmentedControl
			options={MESSAGE_TIMER_OPTIONS}
			value={value}
			onChange={onChange}
			labelledBy={labelledBy}
			isDisabled={isDisabled}
		/>
	);
}
