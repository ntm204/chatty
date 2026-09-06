import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import type { MessageListProps } from "../types/message-list";
import { MAX_RETAINED_MESSAGES } from "../constants/pagination";
import { useMessageEditing, useMessageScroll, useUnreadDivider } from "../hooks";
import { getReadReceipt, scrollToMessage } from "../utils";
import { MessageEditHistory } from "./message-edit-history";
import { MessageRows } from "./message-rows";
import { ReactionDetailsPanel } from "./reaction-details-panel";
import { ScrollToLatestButton } from "./scroll-to-latest-button";
import { ThreadTypingIndicator } from "./thread-typing-indicator";

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
	onReturnToLatest,
}: MessageListProps) {
	const isViewingHistory = Boolean(targetMessageId) || hasMoreNewer;
	const canReturnToLatest = isViewingHistory && Boolean(onReturnToLatest);
	const [returningConversationId, setReturningConversationId] = useState<string | null>(null);
	const isReturningToLatest = returningConversationId === conversationId;
	const hasObservedReturnLoadRef = useRef(false);
	const lastScrollTargetRef = useRef<string | null>(null);
	// The scroll container lives here rather than in the page, so everything that
	// reads or writes scroll position sits in one component.
	const {
		containerRef,
		contentRef,
		handleScroll,
		isFarFromBottom,
		scrollToLatest,
		isPinnedToLatestRef,
		newMessageCount,
	} = useMessageScroll({
		conversationId,
		currentUserId,
		messages,
		isViewingHistory,
		hasMoreOlder,
		isLoadingOlder,
		onLoadOlder,
	});
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

	useEffect(() => {
		lastScrollTargetRef.current = null;
	}, [conversationId, targetMessageId]);

	useEffect(() => {
		if (!targetMessageId || lastScrollTargetRef.current === targetMessageId) return;
		// Wait for the target to render, then leave the reader free to move. Socket
		// edits and page loads must not repeatedly drag them back to the search hit.
		const tryScroll = () => {
			if (lastScrollTargetRef.current !== targetMessageId && scrollToMessage(targetMessageId, "auto")) {
				lastScrollTargetRef.current = targetMessageId;
			}
		};
		tryScroll();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(tryScroll);
		if (containerRef.current) observer.observe(containerRef.current);

		return () => observer.disconnect();
	}, [conversationId, targetMessageId, messages, containerRef]);

	useEffect(() => {
		if (isReturningToLatest && isLoadingThread) hasObservedReturnLoadRef.current = true;
		if (
			returningConversationId !== conversationId ||
			(!isLoadingThread && (!isViewingHistory || hasObservedReturnLoadRef.current))
		) {
			setReturningConversationId(null);
		}
	}, [conversationId, isLoadingThread, isReturningToLatest, isViewingHistory, returningConversationId]);

	/*
	 * Three conditions, and each one is a way the reader would notice:
	 *
	 *  - **At the bottom.** Trimming above somebody who is reading history would
	 *    take the messages out from under them. The ref rather than
	 *    `isFarFromBottom` because this must not re-run on every scroll event.
	 *  - **Not looking at a jumped-to message.** A search result opens the thread
	 *    around an old message with newer ones still unloaded; the newest message
	 *    is not on screen even though the scroll position says bottom.
	 *  - **Nothing newer left to load**, which is the same situation seen from
	 *    the other side.
	 */
	useEffect(() => {
		if (messages.length <= MAX_RETAINED_MESSAGES) return;
		if (targetMessageId || hasMoreNewer || !isPinnedToLatestRef.current) return;

		onTrimHistory();
	}, [messages, targetMessageId, hasMoreNewer, onTrimHistory, isPinnedToLatestRef]);

	const reactionsMessage = reactionsMessageId
		? messages.find((message) => message.id === reactionsMessageId)
		: undefined;

	const handleSaveEdit = useCallback(
		(messageId: string, content: string) => {
			cancelEdit();
			onEditMessage(messageId, content);
		},
		[cancelEdit, onEditMessage],
	);

	function handleJumpToLatest() {
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
				className="h-full overflow-y-auto bg-paper outline-none"
			>
				{/* `justify-end` on a wrapper that is at least as tall as the viewport is
			    what makes a short conversation sit on the composer rather than
			    hanging from the header with a screen of empty paper under it. It
			    does nothing once the thread is long enough to scroll. */}
				<div ref={contentRef} className="flex min-h-full flex-col justify-end">
					{isLoadingOlder && (
						<p className="eyebrow py-4 text-center text-ink-faint">Loading earlier messages…</p>
					)}

					{!hasMoreOlder && messages.length > 0 && (
						<p className="eyebrow py-4 text-center text-ink-faint">
							This is the beginning of the conversation.
						</p>
					)}

					{messages.length === 0 ? (
						<p className="p-8 text-center text-sm text-ink-faint">
							{isLoadingThread ? "Loading messages…" : "No messages yet. Say hello."}
						</p>
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
								targetMessageId={targetMessageId}
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
								onJumpToMessage={onJumpToMessage}
							/>

							{hasMoreNewer && (
								<div className="mb-12 mt-5 text-center">
									<Button
										variant="outline"
										onClick={onLoadNewer}
										disabled={isLoadingNewer}
										className="eyebrow bg-paper-raised px-3.5 py-2 text-ink-soft"
									>
										{isLoadingNewer ? "Loading newer messages…" : "Load newer messages"}
									</Button>
								</div>
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

			<ScrollToLatestButton
				isVisible={isFarFromBottom || canReturnToLatest || isReturningToLatest}
				isLoading={isReturningToLatest}
				newMessageCount={newMessageCount}
				typingMessage={typingMessage ?? null}
				onClick={handleJumpToLatest}
			/>

			{historyMessageId && messages[0] && (
				<MessageEditHistory
					conversationId={messages[0].conversationId}
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
