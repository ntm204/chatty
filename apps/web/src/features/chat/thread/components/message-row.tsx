import type { ConversationTheme, ParticipantDTO } from "@chatty/shared-types";
import { Ban } from "lucide-react";
import { memo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT } from "../../constants/message";
import type { ClusterPosition } from "../types/message-row";
import type { MessageRowActions } from "../types/message-row";
import type { ThreadMessage } from "../../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { countJumboEmoji, findMyReaction } from "../../expressions/utils";
import { resolveDisplayName } from "../../utils";
import { useMessageGestures } from "../hooks/use-message-gestures";
import { useRowSelection } from "../hooks/use-message-selection";
import { useMessageRowMutations } from "../hooks/use-message-row-mutations";
import { DOUBLE_TAP_REACTION } from "../constants/message-row";
import { MessageActionFeedback } from "./message-action-feedback";
import { MessageActions } from "./message-actions";
import { BubbleMeta } from "./bubble-meta";
import { MessageBubble } from "./message-bubble";
import { MessagePinBadge } from "./message-pin-badge";
import { MessageSelectCheck } from "./message-select-check";
import { SwipeReplyHint } from "./swipe-reply-hint";
import { MessageEditor } from "./message-editor";
import { MessageMeta } from "./message-meta";
import { MessageSentCaption } from "./message-sent-caption";
import { MessageReactions } from "../../expressions/components";

interface MessageRowProps extends MessageRowActions {
	message: ThreadMessage;
	isMine: boolean;
	isGroup: boolean;
	/** First of a run from the same author — the one that carries the avatar and the byline. */
	isFirstOfRun: boolean;
	/** The newest message currently loaded — the one that carries a persistent "Sent"/"Seen" caption. */
	isLastMessage: boolean;
	/**
	 * Where this message sits in its run, which decides its corners: see the
	 * tables in `constants/message-row`.
	 */
	clusterPosition: ClusterPosition;
	isEditing: boolean;
	/** Set only on the row the "Seen" marker belongs on; null everywhere else. */
	receipt: ReadReceipt | null;
	/** Whose view this is — the reaction chips need it to know which are theirs. */
	currentUserId: string;
	participants: ParticipantDTO[];
	themeColor: ConversationTheme | null;
	isPinned: boolean;
	/** Yours, and read by somebody: the bubble shows two ticks. */
	isRead?: boolean;
}

/**
 * One message somebody wrote.
 *
 * Consecutive messages share small facing corners while each run keeps soft ends.
 *
 * Metadata and actions share a fixed gutter on the bubble's centreline. Keeping
 * that space in the layout while fading secondary information prevents hover
 * from moving the thread and lets message runs retain their compact rhythm.
 */
export const MessageRow = memo(function MessageRow({
	message,
	isMine,
	isGroup,
	isFirstOfRun,
	isLastMessage,
	clusterPosition,
	isEditing,
	receipt,
	currentUserId,
	participants,
	themeColor,
	isPinned,
	isRead = false,
	...actions
}: MessageRowProps) {
	// Bind only after React's shallow comparison has admitted this row's update.
	const {
		isPending,
		error,
		notice,
		onBookmark,
		onStartEdit,
		onSaveEdit,
		onCancelEdit,
		onDeleteForEveryone,
		onDeleteForMe,
		onShowHistory,
		onRetrySend,
		onDiscardDraft,
		onToggleReaction,
		onShowReactions,
		onReply,
		onForward,
		onTogglePin,
		onJumpToReplyOriginal,
	} = useMessageRowMutations(message, isPinned, actions);
	const author = message.author;
	const isDeleted = Boolean(message.deletedAt);
	const isEdited = Boolean(message.editedAt) && !isDeleted;
	// Only on a message still sending: with no server id yet, nothing may act on it.
	const deliveryState = message.deliveryState;
	// A tombstone has nothing left for the author to change.
	const canModify = isMine && !isDeleted && !deliveryState;
	// A picture states its own time on the image; files and voice notes do not.
	const hasTimeOnMedia =
		!isDeleted &&
		!isEditing &&
		!deliveryState &&
		message.attachments.some((attachment) => attachment.kind === "image");
	const hasImages = message.attachments.length > 0;
	const isVoice = hasImages && message.attachments.every((attachment) => attachment.kind === "audio");
	// A plain text or voice bubble carries its own time and ticks, as Telegram's do.
	const hasTimeInBubble = !isDeleted && !isEditing && !deliveryState && (!hasImages || isVoice);
	// A few emoji standing alone are drawn large and bare; a reply, caption or
	// quote makes them part of something else.
	const jumboCount = !isDeleted && !hasImages && !message.replyTo ? countJumboEmoji(message.content) : 0;
	const hasBubbleMeta = hasTimeInBubble && jumboCount === 0;
	const hasReactions = message.reactions.length > 0;
	// One per person, so this is an emoji and not a list — see `MessageReaction`.
	const myReaction = findMyReaction(message.reactions, currentUserId);

	const { isSelecting, isSelected, onClickCapture, start: startSelection } = useRowSelection(message.id);
	const gestures = useMessageGestures({
		onReply: !isDeleted && !deliveryState && !isEditing ? onReply : undefined,
		onDoubleTap:
			!isDeleted && !deliveryState && !isEditing ? () => onToggleReaction(DOUBLE_TAP_REACTION) : undefined,
	});
	// Captured once: a row that mounts while still sending is one you just sent.
	const [isJustSent, setIsJustSent] = useState(() => Boolean(message.deliveryState));

	return (
		<div
			id={`message-${message.id}`}
			data-message-side={isMine ? "outgoing" : "incoming"}
			className={cn(
				"flex flex-col rounded-message transition-colors",
				// A larger gap between speakers separates turns without a timestamp
				// between every message in the same person's burst.
				isFirstOfRun ? "mt-3 first:mt-0" : "mt-0.5",
				isMine ? "items-end" : "items-start",
				// Held back from full ink until the server has it; a failed draft
				// returns to full strength, its gutter's "Not sent" carrying the state.
				deliveryState === "pending" && "opacity-60",
				isJustSent && "message-just-sent",
			)}
		>
			{/* Groups only, indented past the avatar so the name sits over the bubble. */}
			{!isMine && isFirstOfRun && isGroup && (
				<span className="note font-content font-medium mb-1 ml-12 text-ink-soft sm:ml-13">
					{author ? resolveDisplayName(participants, author) : DELETED_AUTHOR_NAME}
				</span>
			)}

			{/* `group`: hovering anywhere on the row reveals its (invisible) actions. */}
			<div
				data-message-interaction-row
				tabIndex={-1}
				{...gestures.handlers}
				data-selected={isSelected || undefined}
				onClickCapture={onClickCapture}
				className={cn(
					"group relative flex max-w-full items-center gap-2 outline-none sm:gap-3",
					isMine && "flex-row-reverse",
					isEdited && "max-sm:mb-4",
				)}
			>
				{isSelecting && <MessageSelectCheck isSelected={isSelected} />}
				{!isMine &&
					(isFirstOfRun && author ? (
						<Avatar user={author} size="sm" className="self-end" />
					) : (
						// Keeps a run's later bubbles aligned with its first one.
						<span className="size-8 shrink-0" />
					))}

				{/* Capped absolutely as well as proportionally: a full-width line is hard to read back. */}
				<div
					data-message-surface
					// Played once: dropped when it ends, so nothing can replay it later.
					onAnimationEnd={(event) => {
						if (event.animationName === "message-send") setIsJustSent(false);
					}}
					style={gestures.offset ? { transform: `translateX(${-gestures.offset}px)` } : undefined}
					className={cn(
						"relative min-w-0 max-w-[76vw]",
						hasImages || isEditing ? "sm:max-w-[min(62vw,34rem)]" : "sm:max-w-[min(62vw,28rem)]",
					)}
				>
					<span aria-hidden="true" className="message-location-marker" />
					{gestures.offset > 0 && <SwipeReplyHint progress={gestures.progress} />}
					{isPinned && !isDeleted && <MessagePinBadge isMine={isMine} />}
					{isDeleted ? (
						<div
							className={cn(
								"flex items-center gap-2.5 rounded-message border border-dashed border-rule px-4 py-2.5 text-ink-faint",
							)}
						>
							<Ban aria-hidden="true" className="size-3.5 shrink-0" />
							<p className="text-[13px]">{DELETED_MESSAGE_TEXT}</p>
						</div>
					) : isEditing ? (
						<MessageEditor
							initialContent={message.content}
							hasAttachment={message.attachments.length > 0}
							onSave={onSaveEdit}
							onCancel={onCancelEdit}
						/>
					) : (
						<MessageBubble
							message={message}
							isMine={isMine}
							clusterPosition={clusterPosition}
							jumboCount={jumboCount}
							onJumpToReplyOriginal={onJumpToReplyOriginal}
							participants={participants}
							themeColor={themeColor}
							{...(hasBubbleMeta && {
								meta: (
									<BubbleMeta
										createdAt={message.createdAt}
										tick={isMine ? (isRead ? "read" : "sent") : null}
									/>
								),
							})}
							// Nothing to forward on a tombstone or a message still sending.
							{...(!isDeleted && !deliveryState && { onForward })}
							footer={
								hasReactions && (
									<MessageReactions
										reactions={message.reactions}
										currentUserId={currentUserId}
										users={participants}
										isMine={isMine}
										onToggle={onToggleReaction}
										isDisabled={isPending}
										onShowDetails={onShowReactions}
									/>
								)
							}
						/>
					)}
				</div>

				{!isEditing && !deliveryState && !isSelecting && (
					<MessageActions
						isPending={isPending}
						{...(canModify && { onEdit: onStartEdit, onDeleteForEveryone })}
						onDeleteForMe={onDeleteForMe}
						// Both omitted on a tombstone: there is nothing left to answer or to
						// mark, and the server refuses either write anyway.
						{...(!isDeleted && { onReply, onToggleReaction, onForward, onTogglePin, onBookmark })}
						onSelect={startSelection}
						{...(hasReactions && { onShowReactions })}
						isPinned={isPinned}
						isBookmarked={Boolean(message.isBookmarked)}
						myReaction={myReaction}
						authorActionExpiresAt={message.authorActionExpiresAt}
						align={isMine ? "end" : "start"}
					/>
				)}

				<MessageMeta
					createdAt={message.createdAt}
					hasTimeOnMedia={hasTimeOnMedia || hasBubbleMeta}
					isMine={isMine}
					isEdited={isEdited}
					receipt={receipt}
					deliveryState={deliveryState}
					deliveryPhase={message.deliveryPhase}
					uploadProgress={message.uploadProgress}
					onShowHistory={onShowHistory}
					onRetrySend={onRetrySend}
					onDiscardDraft={onDiscardDraft}
				/>
			</div>

			<MessageActionFeedback isPending={isPending} error={error} notice={notice} />

			<MessageSentCaption
				createdAt={message.createdAt}
				isMine={isMine}
				isLastMessage={isLastMessage}
				isGroup={isGroup}
				isDeleted={isDeleted}
				hasDeliveryState={Boolean(deliveryState)}
				receipt={receipt}
				participants={participants}
			/>
		</div>
	);
});
