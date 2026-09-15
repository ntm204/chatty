import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback, useRef } from "react";
import { useSoundSetting } from "@/hooks/use-sound-setting";
import { playMessageChime } from "@/utils/play-message-chime";
import { useMessageAlertPolicy } from "./use-message-alert-policy";
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
	const selectedRef = useRef(selectedConversationId);
	selectedRef.current = selectedConversationId;
	const canAlert = useMessageAlertPolicy(currentUserId, conversations);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (!isEnabled) return;
				if (!message.author || message.author.id === currentUserId) return;

				const isOpenConversation =
					message.conversationId === selectedConversationId && document.visibilityState === "visible";
				if (isOpenConversation) return;

				void canAlert(message).then((isAllowed) => {
					if (!isAllowed || !useSoundSetting.getState().isEnabled) return;
					if (message.conversationId === selectedRef.current && document.visibilityState === "visible") {
						return;
					}
					playMessageChime();
				});
			},
			[isEnabled, currentUserId, canAlert, selectedConversationId],
		),
	);
}
