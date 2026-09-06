import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback } from "react";
import { ATTACHMENT_PREVIEW_TEXT } from "../constants/message";
import { NOTIFICATION_TAG_PREFIX } from "../constants/notification-tag";
import { isConversationMuted } from "../utils/conversation-mute";
import { useNotificationSetting } from "@/hooks/use-notification-setting";
import { useSocketEvent } from "./use-socket-event";

/**
 * Raises a browser notification for a message that arrives while the tab is not
 * being looked at.
 *
 * Three conditions, and each one exists because the notification is worthless
 * or wrong without it:
 *
 *  - **The tab is hidden.** A notification for a message already on screen is
 *    noise, and it is the kind of noise that makes people turn the feature off.
 *  - **Somebody else wrote it.** `message:new` reaches the sender too — that is
 *    how their own message renders — and being notified of your own sentence
 *    from your other tab is absurd.
 *  - **The setting is on and permission was granted.** Both, because either can
 *    be revoked without the other: a browser can drop the permission while the
 *    stored preference still says yes.
 *
 * The tag is the conversation, so ten messages in one thread replace each other
 * rather than stacking ten notifications for one conversation.
 */
export function useMessageNotifications(currentUserId: string, conversations: ConversationDTO[]): void {
	const { isEnabled } = useNotificationSetting();

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (!isEnabled || Notification.permission !== "granted") return;
				if (document.visibilityState === "visible") return;
				if (!message.author || message.author.id === currentUserId) return;
				const conversation = conversations.find((item) => item.id === message.conversationId);
				const isMuted = conversation ? isConversationMuted(conversation) : false;
				if (isMuted && !message.mentionedUserIds.includes(currentUserId)) return;

				new Notification(message.author.displayName, {
					body: message.content || ATTACHMENT_PREVIEW_TEXT,
					tag: `${NOTIFICATION_TAG_PREFIX}${message.conversationId}`,
				});
			},
			[isEnabled, currentUserId, conversations],
		),
	);
}
