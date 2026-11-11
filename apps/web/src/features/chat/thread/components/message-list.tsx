import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibleMessageRead } from "../hooks/use-visible-message-read";
import { useArrivalAnnouncement, useMessageEditing, useMessageScroll, useUnreadDivider } from "../hooks";
import { useMessageNavigationPosition } from "../hooks/use-message-navigation-position";
import { useHistoryTrim } from "../hooks/use-history-trim";
import type { MessageListProps } from "../types/message-list";
import { getReadReceipt } from "../utils/read-receipt";
import { MessageEditHistory } from "./message-edit-history";
import { MessageRows } from "./message-rows";
import { ReactionDetailsPanel } from "../../expressions/components";
import { ReturnToReplyButton } from "./return-to-reply-button";
import { ScrollToLatestButton } from "./scroll-to-latest-button";
import { ThreadTypingIndicator } from "./thread-typing-indicator";
import { EmptyThread } from "./empty-thread";
import { JumpToUnreadButton } from "./jump-to-unread-button";

/**
 * The thread: day rules, system lines and message rows, in one scroll container.
 *
 * What stays here rather than moving into `MessageRow` is everything a row
 * cannot answer on its own — where the day changes, where a run of messages from
 * one person begins, which single message the "Seen" marker belongs on, and
 * which one is open for editing.
 */
export function MessageList({
	conversationId,
	messages,
	unreadCount,
	currentUserId,
	participants,
	typingMessage,
	isGroup,
	themeColor,
	areReceiptsShared,
	isLoadingThread,
	hasMoreOlder,
	isLoadingOlder,
	onLoadOlder,
	hasMoreNewer,
	isLoadingNewer,
	onLoadNewer,
	onEditMessage,
	onDeleteMessage,
	onHideMessage,
	onRetrySend,
	onDiscardDraft,
	onToggleReaction,
	onReplyToMessage,
	onForwardMessage,
	onTogglePinMessage,
	pinnedMessageIds,
	onJumpToMessage,
	onTrimHistory,
	requestEditLast,
	requestCancelEdit,
	onEditingStateChange,
	targetMessageId,
	navigationError = "",
	onReturnToLatest,
}: MessageListProps) {
	// A jumped-to window stays historical until newer paging reaches the live
	// edge; from then on it is the live thread, with read marks and following.
	const [joinedTargetMessageId, setJoinedTargetMessageId] = useState<string | null>(null);
	const wasLoadingNewerRef = useRef(isLoadingNewer);
	useEffect(() => {
		if (wasLoadingNewerRef.current && !isLoadingNewer && !hasMoreNewer && targetMessageId)
			setJoinedTargetMessageId(targetMessageId);
		wasLoadingNewerRef.current = isLoadingNewer;
	}, [hasMoreNewer, isLoadingNewer, targetMessageId]);
	const isViewingHistory = hasMoreNewer || (Boolean(targetMessageId) && joinedTargetMessageId !== targetMessageId);
	const canReturnToLatest = isViewingHistory && Boolean(onReturnToLatest);
	const [returningConversationId, setReturningConversationId] = useState<string | null>(null);
	const isReturningToLatest = returningConversationId === conversationId;
	const hasObservedReturnLoadRef = useRef(false);
	// The list owns both scroll position and the visible read marker.
	const {
		containerRef,
		contentRef,
		handleScroll,
		isFarFromBottom,
		isJumpingToLatest,
		scrollToLatest,
		newMessageCount,
	} = useMessageScroll({
		conversationId,
		currentUserId,
		messages,
		isViewingHistory,
		hasMoreOlder,
		isLoadingOlder,
		onLoadOlder,
		hasMoreNewer,
		isLoadingNewer,
		onLoadNewer,
	});
	const arrivalAnnouncement = useArrivalAnnouncement({ messages, currentUserId, participants });
	// Historical search windows can skip unread messages; resume the cursor at latest.
	useVisibleMessageRead(containerRef, conversationId, currentUserId, messages, !isLoadingThread && !isViewingHistory);
	// Memoised because it is a prop of the memoised `MessageRows`, and it is an
	// object: recomputed per render it would be a new reference every time and
	// would defeat the memo on its own. It also walks the whole thread, so not
	// redoing it on an unrelated render is worth something by itself.
	const readReceipt = useMemo(
		() => getReadReceipt(messages, participants, currentUserId, areReceiptsShared),
		[messages, participants, currentUserId, areReceiptsShared],
	);
	const { editingMessageId, startEdit, cancelEdit } = useMessageEditing({
		messages,
		currentUserId,
		requestEditLast,
		requestCancelEdit,
		onEditingStateChange,
	});
	const [historyMessageId, setHistoryMessageId] = useState<string | null>(null);
	// By id rather than by value, for the reason `editingMessageId` is: the
	// reactions on screen have to follow the `message:updated` broadcasts that
	// arrive while the dialog is open, and a snapshot would freeze the list at
	// whatever it said when it was opened.
	const [reactionsMessageId, setReactionsMessageId] = useState<string | null>(null);
	const { unreadDividerMessageId, initialUnreadCount } = useUnreadDivider({
		conversationId,
		messages,
		unreadCount,
	});

	const { hasReadingPosition, jumpWithReturn, returnToReadingPosition, dismissReadingPosition } =
		useMessageNavigationPosition({
			conversationId,
			targetMessageId,
			messages,
			containerRef,
			isLoadingThread,
			navigationError,
			onJumpToMessage,
		});

	useEffect(() => {
		if (isReturningToLatest && isLoadingThread) hasObservedReturnLoadRef.current = true;
		if (
			returningConversationId !== conversationId ||
			(!isLoadingThread && (!isViewingHistory || hasObservedReturnLoadRef.current))
		) {
			setReturningConversationId(null);
		}
	}, [conversationId, isLoadingThread, isReturningToLatest, isViewingHistory, returningConversationId]);

	useHistoryTrim({ messages, isViewingHistory, isFarFromBottom, isJumpingToLatest, onTrimHistory });

	const reactionsMessage = reactionsMessageId
		? messages.find((message) => message.id === reactionsMessageId)
		: undefined;

	const editingMessageIdRef = useRef(editingMessageId);
	editingMessageIdRef.current = editingMessageId;
	const handleSaveEdit = useCallback(
		async (messageId: string, content: string) => {
			await onEditMessage(messageId, content);
			if (editingMessageIdRef.current === messageId) cancelEdit();
		},
		[cancelEdit, onEditMessage],
	);

	function handleJumpToLatest() {
		dismissReadingPosition();
		// The control disappears at the destination. Keep keyboard navigation in
		// the thread without focusing the composer and opening a mobile keyboard.
		containerRef.current?.focus({ preventScroll: true });
		if (canReturnToLatest && onReturnToLatest) {
			hasObservedReturnLoadRef.current = false;
			setReturningConversationId(conversationId);
			onReturnToLatest();
		} else {
			scrollToLatest();
		}
	}

	return (
		<div className="relative h-full @container">
			<div
				ref={containerRef}
				onScroll={handleScroll}
				role="region"
				aria-label="Message history"
				tabIndex={-1}
				className="message-paper h-full overflow-y-auto bg-paper outline-none"
			>
				{/* `justify-end` on a wrapper that is at least as tall as the viewport is
			    what makes a short conversation sit on the composer rather than
			    hanging from the header with a screen of empty paper under it. It
			    does nothing once the thread is long enough to scroll. */}
				<div ref={contentRef} className="conversation-message-content flex min-h-full flex-col justify-end">
					{isLoadingOlder && (
						<p className="note py-4 text-center text-ink-faint">Loading earlier messages…</p>
					)}

					{!hasMoreOlder && messages.length > 0 && (
						<p className="wallpaper-pill note mx-auto my-4 w-fit rounded-full px-3 py-1 text-ink-faint">
							This is the beginning of the conversation.
						</p>
					)}

					{messages.length === 0 ? (
						<EmptyThread isLoading={isLoadingThread} />
					) : (
						<div className="flex flex-col px-3 pb-4 pt-2 sm:px-5 md:px-8 md:pb-5">
							<MessageRows
								messages={messages}
								currentUserId={currentUserId}
								participants={participants}
								isGroup={isGroup}
								themeColor={themeColor}
								readReceipt={readReceipt}
								unreadDividerMessageId={unreadDividerMessageId}
								unreadCount={initialUnreadCount}
								editingMessageId={editingMessageId}
								pinnedMessageIds={pinnedMessageIds}
								onStartEdit={startEdit}
								onSaveEdit={handleSaveEdit}
								onCancelEdit={cancelEdit}
								onDeleteMessage={onDeleteMessage}
								onHideMessage={onHideMessage}
								onShowHistory={setHistoryMessageId}
								onRetrySend={onRetrySend}
								onDiscardDraft={onDiscardDraft}
								onToggleReaction={onToggleReaction}
								onShowReactions={setReactionsMessageId}
								onReplyToMessage={onReplyToMessage}
								onForwardMessage={onForwardMessage}
								onTogglePinMessage={onTogglePinMessage}
								onJumpToMessage={jumpWithReturn}
							/>

							{isLoadingNewer && (
								<p className="note py-4 text-center text-ink-faint">Loading newer messages…</p>
							)}
						</div>
					)}
					<ThreadTypingIndicator
						isGroup={isGroup}
						typingMessage={
							!isViewingHistory && !isLoadingThread && !isReturningToLatest
								? typingMessage?.trim() || null
								: null
						}
					/>
				</div>
			</div>

			<JumpToUnreadButton
				threadRef={containerRef}
				dividerMessageId={unreadDividerMessageId}
				count={initialUnreadCount}
			/>
			{hasReadingPosition && (
				<ReturnToReplyButton isLoading={isLoadingThread} onClick={returnToReadingPosition} />
			)}
			<ScrollToLatestButton
				hasReturnAction={hasReadingPosition}
				isVisible={isFarFromBottom || canReturnToLatest || isReturningToLatest}
				arrivalAnnouncement={arrivalAnnouncement}
				isLoading={isReturningToLatest}
				newMessageCount={newMessageCount}
				typingMessage={typingMessage ?? null}
				onClick={handleJumpToLatest}
			/>

			{historyMessageId && messages.some((message) => message.id === historyMessageId && !message.deletedAt) && (
				<MessageEditHistory
					conversationId={conversationId}
					messageId={historyMessageId}
					onClose={() => setHistoryMessageId(null)}
				/>
			)}

			{/* Closed rather than emptied when the last reaction is taken off while
			    it is open: an empty dialog is a dead end, and the only way to reach
			    zero from here is somebody undoing the thing being looked at. */}
			{reactionsMessage && reactionsMessage.reactions.length > 0 && (
				<ReactionDetailsPanel
					reactions={reactionsMessage.reactions}
					users={participants}
					currentUserId={currentUserId}
					onClose={() => setReactionsMessageId(null)}
				/>
			)}
		</div>
	);
}
