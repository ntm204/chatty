import type { MessageDTO, ReactionEmoji } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import type { LoadingMessageChanges, PendingUpload } from "../types/conversation-messages";
import type { ThreadMessage } from "../types/thread-message";
import { useLiveMessageEvents } from "./use-live-message-events";
import { useMessageActions } from "./use-message-actions";
import { useMessageHistory } from "./use-message-history";
import { useMessageOutbox } from "./use-message-outbox";
import { useSessionMessageSends } from "./use-session-message-sends";

interface ConversationMessages {
	/** Oldest first, which is the order the view reads. */
	messages: ThreadMessage[];
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	/** True while the first page of a conversation is in flight. */
	isLoadingThread: boolean;
	/** Why the first page could not be fetched, or "" when it could. */
	loadError: string;
	/** A target outside the current page disappeared, while the surrounding thread remains readable. */
	navigationError: string;
	dismissNavigationError: () => void;
	hasUnsavedMessages: boolean;
	/** Fetches the first page again after `loadError`. */
	retryLoad: () => void;
	loadOlder: () => void;
	loadNewer: () => void;
	/** Catches the thread up after the socket was down. See `useSocketConnection`. */
	resync: () => void;
	/**
	 * Sends a message. Resolves once the server has it, but the bubble is on
	 * screen long before that — see the implementation.
	 */
	sendMessage: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		mentionedUserIds?: string[],
	) => Promise<void>;
	/**
	 * Sends a saved sticker. Not optimistic: a sticker's picture has dimensions
	 * the client does not know until it decodes the file, and the bubble-less
	 * layout reserves space from them — a sticker that resizes on arrival is
	 * worse than one that appears a beat later.
	 */
	sendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	sendFile: (
		file: File,
		content: string,
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	sendVoice: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	/** Sends a draft that failed, again. */
	retrySend: (draftId: string) => void;
	/** Throws a failed draft away. */
	discardDraft: (draftId: string) => void;
	/**
	 * Drops the oldest messages once the thread has more than it needs, so a long
	 * session stops growing an array React has to reconcile on every keystroke.
	 * Called by the list, which is the only thing that knows the reader is at the
	 * bottom and will not notice.
	 */
	trimHistory: () => void;
	editMessage: (messageId: string, content: string) => Promise<void>;
	deleteMessage: (messageId: string) => Promise<void>;
	toggleReaction: (messageId: string, emoji: ReactionEmoji) => Promise<void>;
	hideMessage: (messageId: string) => Promise<void>;
	targetMessageId: string | null;
}

/**
 * The whole life of one conversation's message list: the first page, older
 * pages, messages arriving, and messages changing.
 *
 * These were four separate pieces of `ChatPage`, and they were never really
 * independent — every one of them writes the same array, and three of them have
 * to agree about what "already on screen" means. Splitting them apart again
 * would mean handing `setMessages` to four callers and hoping.
 *
 * What is deliberately *not* here: the read marker. `useMarkRead` takes the id
 * of the newest loaded message, which is a fact about the page's viewport rather
 * than about this list.
 *
 * The array and the refs its writers share live here; the work is split by
 * concern into `useMessageHistory` (pages), `useMessageOutbox` (optimistic
 * sends) and `useLiveMessageEvents` (socket), each handed the same store.
 */
export function useConversationMessages(
	conversationId: string | null,
	onConversationsChanged: () => void,
	requestedMessageId: string | null = null,
	onUnavailableMessageNavigation?: () => void,
): ConversationMessages {
	const [messages, setMessages] = useState<ThreadMessage[]>([]);
	const [restoredDraftIds, setRestoredDraftIds] = useState<string[]>([]);
	const pendingUploadsRef = useRef(new Map<string, PendingUpload>());
	const currentUserId = useAuth((state) => state.currentUser?.id);
	const { sendSticker, sendFile, sendVoice } = useSessionMessageSends(conversationId, currentUserId);
	const deliverRef = useRef<(draft: ThreadMessage) => Promise<void>>(async () => undefined);
	const activeCacheScopeRef = useRef<string | null>(null);
	const loadingChangesRef = useRef<LoadingMessageChanges | null>(null);
	const retractionsRef = useRef(new Map<string, MessageDTO>());
	useEffect(() => {
		retractionsRef.current.clear();
	}, [conversationId, currentUserId]);
	const store = {
		setMessages,
		pendingUploadsRef,
		deliverRef,
		activeCacheScopeRef,
		loadingChangesRef,
		retractionsRef,
	};

	const history = useMessageHistory({
		...store,
		conversationId,
		currentUserId,
		requestedMessageId,
		onUnavailableMessageNavigation,
		messages,
		setRestoredDraftIds,
	});

	const { editMessage, deleteMessage, toggleReaction } = useMessageActions(conversationId, setMessages);
	const hideMessage = useCallback(
		async (messageId: string) => {
			if (!conversationId) return;
			await api.hideMessage(conversationId, messageId);
		},
		[conversationId],
	);

	const { sendMessage, retrySend, discardDraft } = useMessageOutbox({
		...store,
		conversationId,
		messages,
		restoredDraftIds,
		setRestoredDraftIds,
	});

	useLiveMessageEvents({ ...store, conversationId, currentUserId, onConversationsChanged });

	return {
		...history,
		messages,
		hasUnsavedMessages: messages.some((message) => message.hasLocalStorageError),
		sendMessage,
		sendSticker,
		sendFile,
		sendVoice,
		retrySend,
		discardDraft,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
	};
}
