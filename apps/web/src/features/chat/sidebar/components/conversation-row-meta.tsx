import { AtSign, Check, CheckCheck, Pin } from "lucide-react";
import { cn } from "@/utils/cn";

interface ConversationRowMetaProps {
	unreadCount: number;
	isMuted: boolean;
	isMentioned: boolean;
	isPinned: boolean;
	/** Your own last message: one tick once sent, two once somebody has read it. */
	tick: "sent" | "read" | null;
}

/**
 * The right-hand edge of a conversation row: one mark at most, centred on the
 * row, as Messenger does — a dot for unread, "@" for a mention, your last
 * message's ticks, or a pin for a pinned chat with nothing else to say. The
 * time lives in the preview line instead ("text · 5m"), so this column is a
 * single narrow lane and every preview truncates at the same edge.
 *
 * A dot, not a count: the name and preview already turn bold when something is
 * unread. The count is still spoken to screen readers.
 */
export function ConversationRowMeta({ unreadCount, isMuted, isMentioned, isPinned, tick }: ConversationRowMetaProps) {
	const hasUnread = unreadCount > 0;

	return (
		<span className="conversation-row-meta flex w-4 shrink-0 items-center justify-center self-center">
			{hasUnread && isMentioned ? (
				<AtSign
					role="img"
					aria-label={`You were mentioned, ${unreadCount} unread messages`}
					className={cn("size-3.5", isMuted ? "text-ink-faint" : "text-signal")}
					strokeWidth={2.5}
				/>
			) : hasUnread ? (
				<span
					role="img"
					aria-label={`${unreadCount} unread messages`}
					// Muted chats mark in grey: present, but not asking.
					className={cn("size-2 rounded-full", isMuted ? "bg-ink-faint" : "bg-signal")}
				/>
			) : tick === "read" ? (
				<CheckCheck role="img" aria-label="Read" className="size-3.5 text-heading" />
			) : tick === "sent" ? (
				<Check role="img" aria-label="Sent" className="size-3.5 text-ink-faint" />
			) : (
				isPinned && <Pin role="img" aria-label="Pinned" className="size-3.5 rotate-45 text-ink-faint" />
			)}
		</span>
	);
}
