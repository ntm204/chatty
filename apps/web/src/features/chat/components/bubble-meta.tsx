import { Check, CheckCheck } from "lucide-react";
import { formatMessageTime } from "../utils";

interface BubbleMetaProps {
	createdAt: string;
	/** Yours only: a tick once it is sent, two once somebody has read it. */
	tick: "sent" | "read" | null;
}

/**
 * The time and ticks inside a text bubble, floated into the last line's free
 * space — Telegram's arrangement, which lets a short message keep its time
 * without growing a line for it.
 */
export function BubbleMeta({ createdAt, tick }: BubbleMetaProps) {
	return (
		<span className="bubble-meta relative top-1 float-right ml-2.5 inline-flex items-center gap-0.5 text-[11px] tabular-nums opacity-65">
			{formatMessageTime(createdAt)}
			{tick === "read" && <CheckCheck aria-label="Read" className="size-3.5" />}
			{tick === "sent" && <Check aria-label="Sent" className="size-3.5" />}
		</span>
	);
}
