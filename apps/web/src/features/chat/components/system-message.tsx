import { formatMessageTime } from "../utils";

interface SystemMessageProps {
	content: string;
	messageId?: string;
	createdAt: string;
}

/**
 * "An added Binh", "Chi left the group".
 *
 * No author, no bubble, no side — it is about the conversation rather than
 * from anyone in it, so it sits centered in its own row instead of either
 * column, the way Messenger and Zalo both set membership/pin events: a small
 * label floating in the middle of the thread rather than a rule across it.
 * The exact time is a native tooltip rather than a permanent second label —
 * it is rarely the point of an event like this, and available on hover/focus
 * without a persistent line of chrome for it.
 */
export function SystemMessage({ content, createdAt, messageId }: SystemMessageProps) {
	return (
		<div id={messageId ? `message-${messageId}` : undefined} className="flex justify-center py-2">
			<span
				title={formatMessageTime(createdAt)}
				className="note max-w-[85%] truncate rounded-full bg-paper-sunken px-3 py-1 text-ink-faint"
			>
				{content}
			</span>
		</div>
	);
}
