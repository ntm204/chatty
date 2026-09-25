import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef } from "react";
import { ATTACHMENT_PREVIEW_TEXT } from "../constants/message";
import { NOTIFICATION_TAG_PREFIX } from "../constants/notification-tag";
import { createNotificationTabCoordinator } from "../utils/notification-tab-coordinator";
import { useMessageAlertPolicy } from "./use-message-alert-policy";
import { useSocketEvent } from "./use-socket-event";
import { useNotificationSetting } from "@/hooks/use-notification-setting";

type OpenConversation = (conversationId: string) => void;

function closeNotification(notification: Notification): void {
	try {
		notification.close();
	} catch {
		// A browser can dismiss a notification between the click and this call.
	}
}

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
 * rather than stacking ten notifications for one conversation. The coordinator
 * makes that one native popup across hidden tabs for the same signed-in account.
 */
export function useMessageNotifications(
	currentUserId: string,
	conversations: ConversationDTO[],
	onOpenConversation?: OpenConversation,
): void {
	const isEnabled = useNotificationSetting((state) => state.isEnabled);
	const canAlert = useMessageAlertPolicy(currentUserId, conversations);
	const coordinatorRef = useRef<ReturnType<typeof createNotificationTabCoordinator> | null>(null);
	const notificationsRef = useRef(new Set<Notification>());
	const lifecycleRef = useRef(0);
	const openConversationRef = useRef(onOpenConversation);
	openConversationRef.current = onOpenConversation;

	useEffect(() => {
		lifecycleRef.current += 1;
		const lifecycle = lifecycleRef.current;
		const coordinator = currentUserId ? createNotificationTabCoordinator(currentUserId) : null;
		coordinatorRef.current = coordinator;

		return () => {
			if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
			coordinator?.dispose();
			for (const notification of notificationsRef.current) closeNotification(notification);
			notificationsRef.current.clear();
			if (lifecycleRef.current === lifecycle) lifecycleRef.current += 1;
		};
	}, [currentUserId]);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (!isEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
				if (document.visibilityState === "visible") return;
				const author = message.author;
				const coordinator = coordinatorRef.current;
				const lifecycle = lifecycleRef.current;
				if (!author || author.id === currentUserId || !coordinator) return;

				const isCurrentLifecycle = () =>
					lifecycleRef.current === lifecycle &&
					coordinatorRef.current === coordinator &&
					currentUserId !== "";

				void canAlert(message).then(async (isAllowed) => {
					if (
						!isAllowed ||
						!isCurrentLifecycle() ||
						document.visibilityState === "visible" ||
						!useNotificationSetting.getState().isEnabled ||
						Notification.permission !== "granted"
					) {
						return;
					}

					const notification = await coordinator.runOnce(message.id, () => {
						if (
							!isCurrentLifecycle() ||
							document.visibilityState === "visible" ||
							!useNotificationSetting.getState().isEnabled ||
							typeof Notification === "undefined" ||
							Notification.permission !== "granted"
						) {
							return null;
						}

						const { isMessagePreviewEnabled } = useNotificationSetting.getState();
						try {
							return new Notification(isMessagePreviewEnabled ? author.displayName : "Chatty", {
								body: isMessagePreviewEnabled
									? message.content || ATTACHMENT_PREVIEW_TEXT
									: "New message",
								tag: `${NOTIFICATION_TAG_PREFIX}${message.conversationId}`,
							});
						} catch {
							// Permission can be revoked after the synchronous check above.
							return null;
						}
					});
					if (!notification) return;
					if (!isCurrentLifecycle()) {
						closeNotification(notification);

						return;
					}

					notificationsRef.current.add(notification);
					notification.onclose = () => notificationsRef.current.delete(notification);
					notification.onclick = () => {
						if (!isCurrentLifecycle()) return;
						try {
							window.focus();
						} catch {
							// Some embedded browsers expose the method but do not permit it.
						}
						openConversationRef.current?.(message.conversationId);
						closeNotification(notification);
					};
				});
			},
			[isEnabled, currentUserId, canAlert],
		),
	);
}
