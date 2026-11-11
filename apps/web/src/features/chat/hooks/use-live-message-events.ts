import type { MessageDTO } from "@chatty/shared-types";
import { useCallback } from "react";
import { removeLocalMessage } from "@/lib/local-chat-store";
import type { ConversationMessageStore } from "../types/conversation-messages";
import { replaceDraft } from "../utils/replace-draft";
import { releaseUpload } from "../utils/pending-upload";
import { useSocketEvent } from "./use-socket-event";

interface LiveMessageEventsOptions extends Pick<
	ConversationMessageStore,
	"setMessages" | "pendingUploadsRef" | "loadingChangesRef" | "retractionsRef"
> {
	conversationId: string | null;
	currentUserId: string | undefined;
	onConversationsChanged: () => void;
}

/**
 * The socket's side of the message list: arrivals, edits and hides. Also
 * records them while a page is loading so the page cannot overwrite them. Part
 * of `useConversationMessages`, which owns the array this writes.
 */
export function useLiveMessageEvents({
	conversationId,
	currentUserId,
	onConversationsChanged,
	setMessages,
	pendingUploadsRef,
	loadingChangesRef,
	retractionsRef,
}: LiveMessageEventsOptions): void {
	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					loadingChangesRef.current?.updates.set(message.id, message);
					if (message.deletedAt) retractionsRef.current.set(message.id, message);
				}
			},
			[conversationId],
		),
	);

	useSocketEvent(
		"message:hidden",
		useCallback(
			(event: { conversationId: string; messageId: string }) => {
				if (event.conversationId === conversationId) {
					loadingChangesRef.current?.hiddenIds.add(event.messageId);
					setMessages((current) => current.filter((message) => message.id !== event.messageId));
				}
				onConversationsChanged();
			},
			[conversationId, onConversationsChanged],
		),
	);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					loadingChangesRef.current?.arrivals.set(message.id, message);
					if (message.clientId && message.author?.id === currentUserId) {
						releaseUpload(pendingUploadsRef.current, message.clientId);
						void removeLocalMessage(message.clientId).catch(() => undefined);
					}
					setMessages((current) => {
						// Two different duplicates to refuse. `id` catches a reconnect
						// replaying an event already on screen; `clientId` catches this
						// reader's own optimistic draft, which is drawn under an id the
						// server has never heard of and would otherwise sit beside the
						// real message until the HTTP response arrived to clear it.
						if (current.some((existing) => existing.id === message.id)) return current;

						return message.clientId
							? replaceDraft(current, message.clientId, message)
							: [...current, message];
					});
				}
			},
			[conversationId, currentUserId],
		),
	);
}
