import { Check, CheckCheck, Pin } from "lucide-react";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { formatRelativeTime } from "../../utils";

interface ConversationRowMetaProps {
	updatedAt: string | null;
	unreadCount: number;
	isMuted: boolean;
	isMentioned: boolean;
	isPinned: boolean;
	/** Your own last message: one tick once sent, two once somebody has read it. */
	tick: "sent" | "read" | null;
}

/**
 * The right-hand column of a conversation row, Telegram's arrangement: ticks
 * and time on the name's line, the count (or the pin) on the preview's. One
 * block, so on hover it steps aside as a whole for the actions button instead
 * of the button landing on top of the count. Colour is spent on the count
 * alone — the time stays grey even when something is unread.
 */
export function ConversationRowMeta({
	updatedAt,
	unreadCount,
	isMuted,
	isMentioned,
	isPinned,
	tick,
}: ConversationRowMetaProps) {
	const hasUnread = unreadCount > 0;
	const count = unreadCount > MAX_UNREAD_BADGE_COUNT ? `${MAX_UNREAD_BADGE_COUNT}+` : String(unreadCount);

	return (
		<span className="conversation-row-meta flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
			<span className="conversation-row-time flex h-5 items-center gap-0.5 text-[11px] tabular-nums text-ink-faint">
				{tick === "read" && <CheckCheck role="img" aria-label="Read" className="size-3.5 text-heading" />}
				{tick === "sent" && <Check role="img" aria-label="Sent" className="size-3.5" />}
				{updatedAt && formatRelativeTime(updatedAt)}
			</span>
			<span className="flex h-5 items-center gap-1">
				{isMentioned && (
					<span
						role="img"
						aria-label="You were mentioned"
						className="meta flex size-[18px] items-center justify-center rounded-full bg-signal font-semibold text-paper-raised"
					>
						@
					</span>
				)}
				{hasUnread && (
					<span
						aria-label={`${unreadCount} unread messages`}
						// Muted chats count in grey: present, but not asking.
						className={cn(
							"meta flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-semibold text-paper-raised",
							isMuted ? "bg-ink-faint" : "bg-signal",
						)}
					>
						{count}
					</span>
				)}
				{/* A pinned chat with nothing new says so where the count would be. */}
				{!hasUnread && isPinned && (
					<Pin role="img" aria-label="Pinned" className="size-3.5 rotate-45 text-ink-faint" />
				)}
			</span>
		</span>
	);
}
