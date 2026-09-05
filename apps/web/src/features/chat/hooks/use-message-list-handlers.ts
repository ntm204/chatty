import type { PinnedMessageDTO } from "@chatty/shared-types";
import { useCallback, useMemo } from "react";
import { api } from "@/api/client";

interface MessageListHandlers {
	pinnedMessageIds: string[];
	onSaveMessage: (messageId: string) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
}

/**
 * The three conversation-scoped props the thread needs, with stable identities.
 *
 * `MessageRows` is memoised, and a memo holds only while every prop keeps its
 * reference between renders. `ChatPage` re-renders on every `typing:update` and
 * every `presence:update` — 109-byte events, several per sentence, per typist —
 * so writing these inline there would hand the thread three new props a second
 * and reconcile up to `MAX_RETAINED_MESSAGES` rows each time. That is the cost
 * phase 46 set out to remove; see the comment on `MessageRows`.
 *
 * Here rather than inline in the page for the ordinary reason too: a page
 * assembles, it does not compute. What is worth knowing beyond that is *why*
 * these particular three, and the answer is that they were the only ones left
 * that could not simply be lifted — each closes over the open conversation.
 *
 * Keyed on `conversationId` rather than on the `ConversationDTO`, which is a
 * fresh object whenever the sidebar array changes: a message arriving in some
 * *other* conversation would otherwise re-arm all three and undo the memo.
 * `pinnedMessages` is the one exception, because it genuinely is the input.
 */
export function useMessageListHandlers(
	conversationId: string | null,
	pinnedMessages: PinnedMessageDTO[] | undefined,
): MessageListHandlers {
	const pinnedMessageIds = useMemo(() => pinnedMessages?.map((pin) => pin.messageId) ?? [], [pinnedMessages]);

	const onSaveMessage = useCallback(
		(messageId: string) => {
			if (conversationId) void api.saveMessage(conversationId, messageId);
		},
		[conversationId],
	);

	const onTogglePinMessage = useCallback(
		(messageId: string, isPinned: boolean) => {
			if (!conversationId) return;

			void (isPinned ? api.unpinMessage(conversationId, messageId) : api.pinMessage(conversationId, messageId));
		},
		[conversationId],
	);

	return { pinnedMessageIds, onSaveMessage, onTogglePinMessage };
}
