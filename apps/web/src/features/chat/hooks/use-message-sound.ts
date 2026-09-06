import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback } from "react";
import { useSoundSetting } from "@/hooks/use-sound-setting";
import { playMessageChime } from "@/utils/play-message-chime";
import { isConversationMuted } from "../utils/conversation-mute";
import { useSocketEvent } from "./use-socket-event";

/**
 * Plays a chime for a message from someone else, unless: sound is off, the
 * conversation is muted (and you are not mentioned), or you are already
 * looking at that exact conversation with the tab visible.
 */
export function useMessageSound(
	currentUserId: string,
	conversations: ConversationDTO[],
	selectedConversationId: string | null,
): void {
	const isEnabled = useSoundSetting((state) => state.isEnabled);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (!isEnabled) return;
				if (!message.author || message.author.id === currentUserId) return;

				const isOpenConversation =
					message.conversationId === selectedConversationId && document.visibilityState === "visible";
				if (isOpenConversation) return;

				const conversation = conversations.find((item) => item.id === message.conversationId);
				const isMuted = conversation ? isConversationMuted(conversation) : false;
				if (isMuted && !message.mentionedUserIds.includes(currentUserId)) return;

				playMessageChime();
			},
			[isEnabled, currentUserId, conversations, selectedConversationId],
		),
	);
}
