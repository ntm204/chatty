import { useEffect, useRef, useState } from "react";
import type { ThreadMessage } from "../../types/thread-message";

interface UseUnreadDividerOptions {
	conversationId: string;
	messages: ThreadMessage[];
	/** Live, and changing — which is exactly why it is frozen below rather than used. */
	unreadCount: number;
}

interface UnreadDivider {
	/** The message the rule is drawn above, or null when there is nothing to divide. */
	unreadDividerMessageId: string | null;
	/** The count as it stood when the conversation was opened, for the rule's label. */
	initialUnreadCount: number;
}

/**
 * Where the "new messages" rule goes, and what it says.
 *
 * The whole difficulty is that `unreadCount` drops to zero within a second of
 * opening a conversation — `useMarkRead` sees to that — so a divider positioned
 * from the live value would appear and immediately vanish, taking the reader's
 * only marker for where they left off with it. The count is captured once per
 * conversation in a ref, and the position is captured once from it.
 *
 * The `conversationId` guard on the second effect is not redundant with the
 * first. Switching conversations resets the ref, but `messages` still holds the
 * *previous* conversation's array for the render before its first page arrives —
 * long enough to place a divider in the wrong thread, which then never moves,
 * because `unreadDividerMessageId` being set is what stops it being recomputed.
 */
export function useUnreadDivider({ conversationId, messages, unreadCount }: UseUnreadDividerOptions): UnreadDivider {
	const initialUnreadCountRef = useRef(0);
	const [unreadDividerMessageId, setUnreadDividerMessageId] = useState<string | null>(null);

	useEffect(() => {
		initialUnreadCountRef.current = unreadCount;
		setUnreadDividerMessageId(null);
	}, [conversationId]);

	useEffect(() => {
		if (unreadDividerMessageId || initialUnreadCountRef.current === 0) return;
		if (messages[0]?.conversationId !== conversationId) return;

		const dividerIndex = Math.max(0, messages.length - initialUnreadCountRef.current);
		setUnreadDividerMessageId(messages[dividerIndex]?.id ?? null);
	}, [conversationId, messages, unreadDividerMessageId]);

	return { unreadDividerMessageId, initialUnreadCount: initialUnreadCountRef.current };
}
