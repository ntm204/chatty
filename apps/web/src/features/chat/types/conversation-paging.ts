/**
 * What the sidebar needs to walk past the first page.
 *
 * One object rather than three props because it travels three components deep —
 * page to sidebar to list — and a trio that always moves together is one thing,
 * not three.
 */
export interface ConversationPaging {
	/** Whether the server holds rows past the ones on screen. */
	hasMore: boolean;
	isLoadingMore: boolean;
	isLoading?: boolean;
	error?: string;
	retry?: () => void;
	/** Appends the next page, oldest-activity first. */
	loadMore: () => void;
}
