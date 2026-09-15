import { applyMessageUpdate } from "@/utils/apply-message-update";
import type { MessageDTO, ReactionEmoji } from "@chatty/shared-types";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "@/api/client";
import { useSocketEvent } from "./use-socket-event";

interface MessageActions {
	editMessage: (messageId: string, content: string) => Promise<void>;
	deleteMessage: (messageId: string) => Promise<void>;
	toggleReaction: (messageId: string, emoji: ReactionEmoji) => Promise<void>;
}

/** Writes settle for inline feedback; socket updates remain the source of rendered message state. */
export function useMessageActions(
	conversationId: string | null,
	setMessages: Dispatch<SetStateAction<MessageDTO[]>>,
): MessageActions {
	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					// Replaced by id, never appended: this is a message already in the
					// conversation. One that has scrolled out of the loaded page simply
					// matches nothing, which is correct — it will arrive in its new
					// state whenever that page is fetched again.
					setMessages((current) => current.map((existing) => applyMessageUpdate(existing, message)));
				}
			},
			[conversationId, setMessages],
		),
	);

	const editMessage = useCallback(
		async (messageId: string, content: string) => {
			if (!conversationId) return;

			await api.editMessage(conversationId, messageId, content);
		},
		[conversationId],
	);

	const deleteMessage = useCallback(
		async (messageId: string) => {
			if (!conversationId) return;

			await api.deleteMessage(conversationId, messageId);
		},
		[conversationId],
	);

	const toggleReaction = useCallback(
		async (messageId: string, emoji: ReactionEmoji) => {
			if (!conversationId) return;

			await api.toggleReaction(conversationId, messageId, emoji);
		},
		[conversationId],
	);

	return { editMessage, deleteMessage, toggleReaction };
}
