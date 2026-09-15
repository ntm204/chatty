import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import type { ThreadMessage } from "../types/thread-message";

interface ReplyTarget {
	/** The message the composer is answering, or null. */
	replyTo: MessageDTO | null;
	setReplyTo: (message: MessageDTO | null) => void;
	/**
	 * Answers a message by id, for when the message itself is not loaded yet —
	 * a draft restored from the device names the id it was replying to, and the
	 * thread it belongs to may still be fetching.
	 */
	requestReplyTo: (messageId: string) => void;
	/** Drops both the target and any queued one. Called when the conversation changes. */
	clearReply: () => void;
}

/**
 * The composer's reply target, and the queue behind it.
 *
 * Extracted from `ChatPage` for the reason `useConversationList` was: two pieces
 * of state that only make sense together, plus the effect that resolves one into
 * the other, is one subject rather than three lines of a page.
 *
 * The queue exists because a restored draft knows only an **id**. Setting
 * `replyTo` from it directly would need the message, which may not be on screen
 * yet, so the id waits here until the thread has loaded something matching.
 */
export function useReplyTarget(messages: ThreadMessage[]): ReplyTarget {
	const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
	const [pendingReplyId, setPendingReplyId] = useState<string | null>(null);

	useEffect(() => {
		if (!pendingReplyId) return;
		const target = messages.find((message) => message.id === pendingReplyId);
		if (target) {
			setReplyTo(target);
			setPendingReplyId(null);
		}
	}, [messages, pendingReplyId]);

	const currentReply = replyTo ? (messages.find((message) => message.id === replyTo.id) ?? replyTo) : null;

	const clearReply = useCallback(() => {
		setReplyTo(null);
		setPendingReplyId(null);
	}, []);

	return { replyTo: currentReply, setReplyTo, requestReplyTo: setPendingReplyId, clearReply };
}
