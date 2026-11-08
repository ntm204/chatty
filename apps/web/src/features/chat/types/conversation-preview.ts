/** Which conversation is being previewed, how, and from where on screen. */
export interface ConversationPreviewTarget {
	conversationId: string;
	variant: "sheet" | "popover";
	/** The row it was opened from. */
	anchor: DOMRect;
	/** The sidebar's right edge; the desktop panel opens just past it. */
	sidebarRight: number;
}
