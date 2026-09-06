import { formatMessageTime } from "../utils";

interface MessageTimeSeparatorProps {
	isoTimestamp: string;
}

/** Re-orients a thread after a long pause without repeating the calendar day. */
export function MessageTimeSeparator({ isoTimestamp }: MessageTimeSeparatorProps) {
	return (
		<div
			role="separator"
			className="flex justify-center py-5"
			aria-label={`Conversation resumed at ${formatMessageTime(isoTimestamp)}`}
		>
			<time dateTime={isoTimestamp} className="meta rounded-full bg-paper-sunken px-3 py-1 text-ink-faint">
				{formatMessageTime(isoTimestamp)}
			</time>
		</div>
	);
}
