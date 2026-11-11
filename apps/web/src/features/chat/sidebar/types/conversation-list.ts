/** The sidebar's folders: every chat, or only those that match. */
export type ChatFolder = "all" | "unread" | "groups" | "direct";

/** Which conversation is being previewed, how, and from where on screen. */
export interface ConversationPreviewTarget {
	conversationId: string;
	variant: "sheet" | "popover";
	/** The row it was opened from. */
	anchor: DOMRect;
	/** The sidebar's right edge; the desktop panel opens just past it. */
	sidebarRight: number;
}

/** What an empty list says when the cause is a filter or the archive, not a first visit. */
export interface ConversationListEmptyState {
	title: string;
	description: string;
}
