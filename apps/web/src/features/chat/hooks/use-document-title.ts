import type { ConversationDTO } from "@chatty/shared-types";
import { useEffect } from "react";
import { buildDocumentTitle } from "../utils/document-title";
import { isConversationMuted } from "../utils/conversation-mute";
import { useMuteExpiry } from "./use-mute-expiry";

/**
 * Puts the unread total in the tab title.
 *
 * The one thing this app could not do while it was not the tab being looked at:
 * say that something had happened. Everything else about an unread message —
 * the badge, the ordering, the preview — is only visible to somebody already
 * looking at the screen it is on.
 *
 * Muted conversations keep their sidebar badges but do not contribute to the
 * tab count until notifications resume.
 */
export function useDocumentTitle(conversations: ConversationDTO[]): void {
	useMuteExpiry(conversations.map((conversation) => conversation.mutedUntil));
	const unreadCount = conversations.reduce(
		(total, conversation) => total + (isConversationMuted(conversation) ? 0 : conversation.unreadCount),
		0,
	);

	useEffect(() => {
		document.title = buildDocumentTitle(unreadCount);

		// Restored on unmount, so signing out does not leave a count in the tab of
		// an app that is showing a login form.
		return () => {
			document.title = buildDocumentTitle(0);
		};
	}, [unreadCount]);
}
