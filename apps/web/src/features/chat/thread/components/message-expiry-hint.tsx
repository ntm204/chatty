import { Timer } from "lucide-react";
import { useSharedClock } from "../hooks/use-shared-clock";
import { formatTimeLeft } from "../utils/format-time-left";

interface MessageExpiryHintProps {
	expiresAt: string;
}

/**
 * "⏱ 23h" beside a disappearing message's time: how long it has left, kept
 * current by the one clock all such labels share. Spoken in full.
 */
export function MessageExpiryHint({ expiresAt }: MessageExpiryHintProps) {
	const timeLeft = formatTimeLeft(expiresAt, useSharedClock());

	return (
		<span className="flex items-center gap-0.5" aria-label={`Disappears in ${timeLeft}`}>
			<Timer aria-hidden="true" className="size-3" />
			{timeLeft}
		</span>
	);
}
