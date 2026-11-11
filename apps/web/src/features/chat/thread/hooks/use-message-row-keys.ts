import { useLayoutEffect, useRef } from "react";
import type { ThreadMessage } from "../../types/thread-message";
import { isDraftId } from "../../utils/build-draft-message";

interface MessageRowKeys {
	userId: string;
	keys: Map<string, string>;
}

/** Keep an open row's UI when the server acknowledges its optimistic message. */
export function useMessageRowKeys(messages: ThreadMessage[], userId: string): Map<string, string> {
	const committedRef = useRef<MessageRowKeys>({ userId, keys: new Map() });
	const previous = committedRef.current.userId === userId ? committedRef.current.keys : new Map<string, string>();
	const visibleIds = new Set(messages.map((message) => message.id));
	const keys = new Map<string, string>();
	for (const message of messages) {
		const draftKey =
			message.author?.id === userId &&
			message.clientId &&
			isDraftId(message.clientId) &&
			!visibleIds.has(message.clientId)
				? previous.get(message.clientId)
				: undefined;
		keys.set(message.id, previous.get(message.id) ?? draftKey ?? message.id);
	}
	useLayoutEffect(() => {
		// History and update DTOs omit clientId. Retain the acknowledged alias
		// while this row is rendered, without accumulating keys for paged-out rows.
		committedRef.current = { userId, keys };
	}, [keys, userId]);

	return keys;
}
