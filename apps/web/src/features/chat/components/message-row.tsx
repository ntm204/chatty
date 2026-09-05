import type { ParticipantDTO } from "@chatty/shared-types";
import { Ban } from "lucide-react";
import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT } from "../constants/message";
import { DEFAULT_REACTION } from "../constants/reactions";
import type { ClusterPosition } from "../types/message-cluster";
import type { MessageRowActions } from "../types/message-row-actions";
import type { ThreadMessage } from "../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { bindMessageRowActions, countJumboEmoji, findMyReaction } from "../utils";
import { MessageActions } from "./message-actions";
import { MessageBubble } from "./message-bubble";
import { MessageEditor } from "./message-editor";
import { MessageMeta } from "./message-meta";
import { MessageReactions } from "./message-reactions";

interface MessageRowProps extends MessageRowActions {
	message: ThreadMessage;
	isMine: boolean;
	isGroup: boolean;
	/** First of a run from the same author — the one that carries the avatar and the byline. */
	isFirstOfRun: boolean;
	/** Last message in a shared activity burst, regardless of who spoke. */
	isTimeAnchor: boolean;
	/**
	 * Where this message sits in its run, which decides its corners: see the
	 * tables in `constants/message-cluster`.
	 */
	clusterPosition: ClusterPosition;
	/** The message a search result jumped to, highlighted until the reader moves on. */
	isTargeted: boolean;
	isEditing: boolean;
	/** Set only on the row the "Seen" marker belongs on; null everywhere else. */
	receipt: ReadReceipt | null;
	/** Whose view this is — the reaction chips need it to know which are theirs. */
	currentUserId: string;
	participants: ParticipantDTO[];
	isPinned: boolean;
}

/**
 * One message somebody wrote.
 *
 * The bubble's bottom corner is cut to 2px on the side the message came from,
 * so authorship remains legible without relying on colour alone.
 *
 * Metadata and actions share a fixed gutter on the bubble's centreline. Keeping
 * that space in the layout while fading secondary information prevents hover
 * from moving the thread and lets message runs retain their compact 3px rhythm.
 */
export const MessageRow = memo(function MessageRow({
	message,
	isMine,
	isGroup,
	isFirstOfRun,
	isTimeAnchor,
	clusterPosition,
	isTargeted,
	isEditing,
	receipt,
	currentUserId,
	participants,
	isPinned,
	...actions
}: MessageRowProps) {
	// Bind only after React's shallow comparison has admitted this row's update.
	const {
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
		onSave,
		onTogglePin,
		onJumpToReplyOriginal,
	} = bindMessageRowActions(message, isPinned, actions);
	const author = message.author;
	const isDeleted = Boolean(message.deletedAt);
	const isEdited = Boolean(message.editedAt) && !isDeleted;
	// Set only on a message this tab is still sending. Nothing may act on one:
	// the server has no id for it yet, so an edit, a delete or a reaction would
	// have nothing to name.
	const deliveryState = message.deliveryState;
	// A tombstone has no content and no image left to change, so the author's
	// two actions have nothing to act on — the row stays only to hold its place.
	const canModify = isMine && !isDeleted && !deliveryState;
	// Speaker changes shape the bubbles, but they do not restart the clock. The
	// list supplies one shared time anchor for the whole activity burst; a receipt
	// keeps its message's time beside the delivery state as useful context.
	const isTimeAlwaysVisible = isTimeAnchor || Boolean(receipt);
	// A picture states its own time, in a chip on the image. Only a picture: a
	// file card and a voice player are rows of ink on paper like any other
	// bubble, and the gutter is level with them.
	const hasTimeOnMedia =
		!isDeleted &&
		!isEditing &&
		!deliveryState &&
		message.attachments.some((attachment) => attachment.kind === "image");
	const hasImages = message.attachments.length > 0;
	// A message that is nothing but a few emoji is drawn large and bare, the way
	// every messenger worth using does it: at bubble size an emoji is a typo, and
	// the bubble is chrome around content that does not need explaining. Only when
	// it stands alone — a reply, a caption or a quote makes it part of something.
	const jumboCount = !isDeleted && !hasImages && !message.replyTo ? countJumboEmoji(message.content) : 0;
	// The chips straddle the bubble's bottom edge: half of a 22px chip is on the
	// bubble and half is below it, so the row has to reserve those 11px plus room
	// for the shadow to clear the next bubble rather than land on it.
	const hasReactions = message.reactions.length > 0;
	// One per person, so this is an emoji and not a list — see `MessageReaction`.
	const myReaction = findMyReaction(message.reactions, currentUserId);

	// Double-click is the fastest way to leave a heart and the gesture every
	// messenger binds to it. It also selects the word underneath, which would
	// leave a highlight sitting on the message it just reacted to, so the
	// selection is dropped in the same breath.
	function reactWithDefault() {
		if (isDeleted || isEditing || deliveryState) return;
		window.getSelection()?.removeAllRanges();
		onToggleReaction(DEFAULT_REACTION);
	}

	function revealTouchActions(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerType === "mouse") return;
		if ((event.target as HTMLElement).closest("a, button, input, textarea, [role='button']")) return;

		// A phone has no hover. Focusing the row on a plain tap reveals only this
		// message's overflow action; focusing the composer or another message hides
		// it again. `-1` keeps hundreds of rows out of the keyboard tab order.
		event.currentTarget.focus({ preventScroll: true });
	}

	return (
		<div
			id={`message-${message.id}`}
			className={cn(
				"flex flex-col rounded-bubble transition",
				// The gap between two people is four times the gap inside one
				// person's burst. That ratio is the only thing telling the eye where
				// one turn ends, now that the timestamps have left the vertical.
				isFirstOfRun ? "mt-4 first:mt-0" : "mt-[3px]",
				isTargeted && "bg-signal-soft ring-4 ring-signal-soft",
				isMine ? "items-end" : "items-start",
				// Held back from full ink until the server has it. The words are the
				// point, so they stay legible — this says "not settled yet", not
				// "unreadable". A failed draft goes back to full strength: it is the
				// gutter's "Not sent" that carries the state, and a faded message
				// with a decision attached to it reads as already dismissed.
				deliveryState === "pending" && "opacity-60",
			)}
		>
			{/* Outside the hover row and indented past the avatar, so the name sits
			    over the bubble rather than over the face. Groups only: in a 1-1 the
			    header already names the one person it could possibly be. */}
			{!isMine && isFirstOfRun && isGroup && (
				<span className="eyebrow mb-1.5 ml-12 text-ink-soft sm:ml-13">
					{/* A USER message with no author is one whose writer deleted their
					    account — still theirs to have said, no longer theirs to be
					    named for. */}
					{author ? author.displayName : DELETED_AUTHOR_NAME}
				</span>
			)}

			{/* `group` so the hover that reveals the actions and the time is the whole
			    row rather than the controls themselves, which are invisible until it
			    happens and so cannot be hovered first. */}
			<div
				data-message-interaction-row
				tabIndex={-1}
				onPointerUp={revealTouchActions}
				className={cn(
					"group relative flex max-w-full items-center gap-2 outline-none sm:gap-3",
					isMine && "flex-row-reverse",
					// Only the half of the reaction pill that hangs below the bubble needs
					// reserving — 10px of a 20px pill, plus 6px so the next message does
					// not touch it. It moved with the pill when that shrank from 22px.
					hasReactions && "mb-4",
					!hasReactions && (isTimeAlwaysVisible || isEdited) && "max-sm:mb-4",
				)}
			>
				{/* The spacer keeps a run's later bubbles aligned with its first one;
				    without it they slide under the avatar. `self-end` rather than
				    centred, because a face floating halfway up a tall photograph
				    belongs to nothing. */}
				{!isMine &&
					(isFirstOfRun && author ? (
						<Avatar user={author} size="sm" className="self-end" />
					) : (
						<span className="size-8 shrink-0" />
					))}

				{/* Capped in absolute terms as well as proportionally: on a wide window
				    70% is a line of text long enough that the eye loses its place
				    returning to the left edge. On the bubble rather than on the row,
				    so the gutter beside it is not paid for out of the text's width. */}
				<div
					onDoubleClick={reactWithDefault}
					className="relative min-w-0 max-w-[76vw] sm:max-w-[min(62vw,34rem)]"
				>
					{isDeleted ? (
						<div
							className={cn(
								// Round on all four corners, with no notch on either side. The
								// notch says "this is where a turn ends", and a tombstone is not
								// a turn — nothing was said. It is also why the list treats a
								// deleted message as belonging to no run at all.
								"flex items-center gap-2.5 rounded-bubble border border-dashed border-rule px-4 py-2.5 text-ink-faint",
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
							isTimeAlwaysVisible={isTimeAlwaysVisible}
							jumboCount={jumboCount}
							onJumpToReplyOriginal={onJumpToReplyOriginal}
							participants={participants}
							// The same condition the row's own menu is drawn under: a
							// tombstone has nothing left to forward, and a message this
							// tab is still sending has no id to forward.
							{...(!isDeleted && !deliveryState && { onForward })}
						/>
					)}

					{hasReactions && (
						<MessageReactions
							reactions={message.reactions}
							currentUserId={currentUserId}
							users={participants}
							isMine={isMine}
							onToggle={onToggleReaction}
							onShowDetails={onShowReactions}
						/>
					)}
				</div>

				{!isEditing && !deliveryState && (
					<MessageActions
						{...(canModify && { onEdit: onStartEdit, onDeleteForEveryone })}
						onDeleteForMe={onDeleteForMe}
						// Both omitted on a tombstone: there is nothing left to answer or to
						// mark, and the server refuses either write anyway.
						{...(!isDeleted && { onReply, onToggleReaction, onForward, onSave, onTogglePin })}
						{...(hasReactions && { onShowReactions })}
						isPinned={isPinned}
						myReaction={myReaction}
						authorActionExpiresAt={message.authorActionExpiresAt}
						align={isMine ? "end" : "start"}
					/>
				)}

				<MessageMeta
					createdAt={message.createdAt}
					hasTimeOnMedia={hasTimeOnMedia}
					isMine={isMine}
					isGroup={isGroup}
					isEdited={isEdited}
					isTimeAlwaysVisible={isTimeAlwaysVisible}
					receipt={receipt}
					participants={participants}
					deliveryState={deliveryState}
					onShowHistory={onShowHistory}
					onRetrySend={onRetrySend}
					onDiscardDraft={onDiscardDraft}
				/>
			</div>
		</div>
	);
});
