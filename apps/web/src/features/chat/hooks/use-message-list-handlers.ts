import type { PinnedMessageDTO } from "@chatty/shared-types";
import { useCallback, useMemo } from "react";
import { api } from "@/api/client";

interface MessageListHandlers {
	pinnedMessageIds: string[];
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
}

/**
 * The conversation-scoped props the thread needs, with stable identities.
 *
 * `MessageRows` is memoised, and a memo holds only while every prop keeps its
 * reference between renders. `ChatPage` re-renders on every `typing:update` and
 * every `presence:update` — 109-byte events, several per sentence, per typist —
 * so writing these inline there would hand the thread a new prop a second and
 * reconcile up to `MAX_RETAINED_MESSAGES` rows each time. That is the cost
 * phase 46 set out to remove; see the comment on `MessageRows`.
 *
 * Here rather than inline in the page for the ordinary reason too: a page
 * assembles, it does not compute. What is worth knowing beyond that is *why*
 * this one, and the answer is that it could not simply be lifted — it closes
 * over the open conversation.
 *
 * Keyed on `conversationId` rather than on the `ConversationDTO`, which is a
 * fresh object whenever the sidebar array changes: a message arriving in some
 * *other* conversation would otherwise re-arm it and undo the memo.
 * `pinnedMessages` is the one exception, because it genuinely is the input.
 */
export function useMessageListHandlers(
	conversationId: string | null,
	pinnedMessages: PinnedMessageDTO[] | undefined,
): MessageListHandlers {
	const pinnedMessageIds = useMemo(() => pinnedMessages?.map((pin) => pin.messageId) ?? [], [pinnedMessages]);

	const onTogglePinMessage = useCallback(
		(messageId: string, isPinned: boolean) => {
			if (!conversationId) return;

			void (isPinned ? api.unpinMessage(conversationId, messageId) : api.pinMessage(conversationId, messageId));
		},
		[conversationId],
	);

	return { pinnedMessageIds, onTogglePinMessage };
}
