import type { MessageDTO } from "@chatty/shared-types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ThreadMessage } from "./thread-message";

/**
 * The files behind one optimistic image message, and the object URLs standing
 * in for them until the server has its own.
 *
 * Kept beside the thread rather than inside it: a `ThreadMessage` is the shape
 * the list renders, and a `File` is not something anything renders. The `urls`
 * are held separately from the draft's attachments so releasing them does not
 * depend on the draft still being in the array — which, on a discard, it is not.
 */
export interface PendingUpload {
	filesPromise: Promise<File[]>;
	urls: string[];
}

export interface LoadingMessageChanges {
	arrivals: Map<string, MessageDTO>;
	updates: Map<string, MessageDTO>;
	hiddenIds: Set<string>;
}

/**
 * The one message array and the refs its writers must agree on. Owned by
 * `useConversationMessages` and handed to the history, outbox and live-event
 * hooks, which all write the same array.
 */
export interface ConversationMessageStore {
	setMessages: Dispatch<SetStateAction<ThreadMessage[]>>;
	pendingUploadsRef: MutableRefObject<Map<string, PendingUpload>>;
	deliverRef: MutableRefObject<(draft: ThreadMessage) => Promise<void>>;
	activeCacheScopeRef: MutableRefObject<string | null>;
	loadingChangesRef: MutableRefObject<LoadingMessageChanges | null>;
	retractionsRef: MutableRefObject<Map<string, MessageDTO>>;
}
