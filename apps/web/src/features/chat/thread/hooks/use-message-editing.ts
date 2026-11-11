import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadMessage } from "../../types/thread-message";

interface UseMessageEditingOptions {
	messages: ThreadMessage[];
	currentUserId: string;
	/**
	 * Both arrive from the keyboard map as a counter rather than a boolean: "edit
	 * the last message" has to fire again when it is asked for a second time, and
	 * a boolean that is already true has nothing left to change.
	 */
	requestEditLast: number;
	requestCancelEdit: number;
	/** Told whenever the thread opens or closes an editor, so the composer can step aside. */
	onEditingStateChange: (isEditing: boolean) => void;
}

interface MessageEditing {
	/** Which message is open for editing, by id. Null when none is. */
	editingMessageId: string | null;
	startEdit: (messageId: string) => void;
	cancelEdit: () => void;
}

/**
 * Which message the thread has open for editing, and the two keyboard requests
 * that can change it.
 *
 * By id rather than by index, which is the whole reason this is not a plain
 * `useState` in the list: a page of older messages prepends and would shift
 * every index under the editor onto a different message.
 *
 * The counters are compared against a ref rather than watched for truthiness.
 * `requestEditLast` going 3 → 4 is a new request and 4 → 4 is not, and the ref is
 * what keeps a re-render for any other reason from reopening an editor the
 * reader has just closed.
 */
export function useMessageEditing({
	messages,
	currentUserId,
	requestEditLast,
	requestCancelEdit,
	onEditingStateChange,
}: UseMessageEditingOptions): MessageEditing {
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const handledEditRequestRef = useRef(0);
	const handledCancelRequestRef = useRef(0);

	useEffect(() => {
		if (requestEditLast === 0 || requestEditLast === handledEditRequestRef.current) return;
		handledEditRequestRef.current = requestEditLast;
		const lastEditable = [...messages]
			.reverse()
			.find(
				(message) =>
					message.author?.id === currentUserId &&
					!message.deletedAt &&
					!message.deliveryState &&
					Boolean(message.authorActionExpiresAt) &&
					Date.parse(message.authorActionExpiresAt ?? "") > Date.now(),
			);
		if (lastEditable) setEditingMessageId(lastEditable.id);
	}, [requestEditLast, messages, currentUserId]);

	useEffect(() => {
		if (requestCancelEdit === 0 || requestCancelEdit === handledCancelRequestRef.current) return;
		handledCancelRequestRef.current = requestCancelEdit;
		setEditingMessageId(null);
	}, [requestCancelEdit]);

	useEffect(() => onEditingStateChange(Boolean(editingMessageId)), [editingMessageId, onEditingStateChange]);

	// Wrapped rather than written inline in the returned object, because it is a
	// prop of the memoised `MessageRows`: a fresh closure per render is a fresh
	// prop per render, and a memoised subtree whose props always differ is a
	// `memo()` that costs a comparison and never saves a render. `startEdit` needs
	// no wrapper — a `useState` setter is already stable.
	const cancelEdit = useCallback(() => setEditingMessageId(null), []);

	return {
		editingMessageId,
		startEdit: setEditingMessageId,
		cancelEdit,
	};
}
