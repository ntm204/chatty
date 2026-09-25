import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { useSocketEvent } from "./use-socket-event";
import type { ThreadMessage } from "../types/thread-message";

interface ReplyTarget {
	pendingReplyId: string | null;
	replyError: string;
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
 * A restored draft knows only an id. Resolve it through the membership-scoped
 * context endpoint without moving the reader's history window. A failed lookup
 * keeps that id until deliberate retry/removal, never silently sends without it.
 */
export function useReplyTarget(messages: ThreadMessage[], conversationId: string | null): ReplyTarget {
	const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
	const [pendingReplyId, setPendingReplyId] = useState<string | null>(null);
	const [replyError, setReplyError] = useState("");
	const scopeRef = useRef(conversationId);
	const requestRef = useRef(0);
	useEffect(
		() => () => {
			requestRef.current += 1;
		},
		[],
	);
	if (scopeRef.current !== conversationId) {
		scopeRef.current = conversationId;
		requestRef.current += 1;
		setReplyTo(null);
		setPendingReplyId(null);
		setReplyError("");
	}
	const selectReply = useCallback((message: MessageDTO | null) => {
		requestRef.current += 1;
		setReplyTo(message);
		setPendingReplyId(null);
		setReplyError("");
	}, []);
	const clearReply = useCallback(() => selectReply(null), [selectReply]);
	const requestReplyTo = useCallback(
		async (messageId: string) => {
			const scope = scopeRef.current;
			if (!scope) return;
			const request = ++requestRef.current;
			setReplyTo(null);
			setPendingReplyId(messageId);
			setReplyError("");
			try {
				const context = await api.getMessageContext(scope, messageId);
				if (request !== requestRef.current || scope !== scopeRef.current) return;
				const target = context.messages.find((message) => message.id === messageId);
				if (!target) throw new Error("Unavailable reply");
				selectReply(target);
			} catch {
				if (request !== requestRef.current || scope !== scopeRef.current) return;
				setReplyError("The reply could not be restored. Try again or remove the reply to send your draft.");
			}
		},
		[selectReply],
	);
	useSocketEvent("message:updated", (message) => {
		if (message.conversationId !== conversationId) return;
		if (message.id === replyTo?.id || message.id === pendingReplyId) selectReply(message);
	});
	useSocketEvent("message:hidden", (event) => {
		if (event.conversationId !== conversationId) return;
		if (event.messageId !== replyTo?.id && event.messageId !== pendingReplyId) return;
		requestRef.current += 1;
		setReplyTo(null);
		setPendingReplyId(event.messageId);
		setReplyError("This reply is no longer available. Remove the reply to send your draft.");
	});
	const currentReply = replyTo ? (messages.find((message) => message.id === replyTo.id) ?? replyTo) : null;

	return { replyTo: currentReply, pendingReplyId, replyError, setReplyTo: selectReply, requestReplyTo, clearReply };
}
