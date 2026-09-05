import type { ParticipantDTO } from "@chatty/shared-types";
import { Fragment, memo } from "react";
import type { MessageRowActions } from "../types/message-row-actions";
import type { ThreadMessage } from "../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { getClusterPosition, hasMessageTimeGap, isNewDay, isWithinMessageBurst } from "../utils";
import { DaySeparator } from "./day-separator";
import { MessageRow } from "./message-row";
import { MessageTimeSeparator } from "./message-time-separator";
import { SystemMessage } from "./system-message";
import { UnreadDivider } from "./unread-divider";

interface MessageRowsProps extends MessageRowActions {
	messages: ThreadMessage[];
	currentUserId: string;
	participants: ParticipantDTO[];
	isGroup: boolean;
	readReceipt: ReadReceipt | null;
	unreadDividerMessageId: string | null;
	unreadCount: number;
	editingMessageId: string | null;
	targetMessageId?: string | null | undefined;
	pinnedMessageIds: string[];
}

/**
 * Skip the list walk on typing and unrelated presence updates. Each MessageRow
 * also receives unbound callbacks, so unchanged rows can skip message updates.
 * Keep callback props stable at the page and list boundaries.
 */
export const MessageRows = memo(function MessageRows({
	messages,
	currentUserId,
	participants,
	isGroup,
	readReceipt,
	unreadDividerMessageId,
	unreadCount,
	editingMessageId,
	targetMessageId,
	pinnedMessageIds,
	...actions
}: MessageRowsProps) {
	return messages.map((message, index) => {
		const previous = messages[index - 1];
		const isFirstOfDay = isNewDay(message.createdAt, previous?.createdAt);
		const hasLongPause = !isFirstOfDay && hasMessageTimeGap(message.createdAt, previous?.createdAt);
		const divider = message.id === unreadDividerMessageId ? <UnreadDivider count={unreadCount} /> : null;

		if (message.kind === "system") {
			return (
				<Fragment key={message.id}>
					{divider}
					{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
					{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
					<SystemMessage content={message.content} createdAt={message.createdAt} />
				</Fragment>
			);
		}

		const author = message.author;
		const isDeleted = Boolean(message.deletedAt);
		const isWithinPreviousBurst = isWithinMessageBurst(message.createdAt, previous?.createdAt);
		const isFirstOfRun =
			!author ||
			isDeleted ||
			isFirstOfDay ||
			!isWithinPreviousBurst ||
			Boolean(message.replyTo) ||
			Boolean(previous?.deletedAt) ||
			previous?.author?.id !== author.id;
		const next = messages[index + 1];
		const isWithinNextBurst = next ? isWithinMessageBurst(next.createdAt, message.createdAt) : false;
		// Time belongs to the conversation's rhythm, not to its speaker turns.
		// In a lively group every alternating author is a separate visual run; if
		// run boundaries also printed time, a single minute became a wall of the
		// same timestamp. Keep one visible anchor at the end of the shared activity
		// burst and leave each individual time available on hover or keyboard focus.
		const isTimeAnchor =
			!next || next.kind === "system" || !isWithinNextBurst || isNewDay(next.createdAt, message.createdAt);
		const isLastOfRun =
			!author ||
			isDeleted ||
			!next ||
			next.kind === "system" ||
			!isWithinNextBurst ||
			Boolean(next.replyTo) ||
			Boolean(next.deletedAt) ||
			next.author?.id !== author.id ||
			isNewDay(next.createdAt, message.createdAt);
		const isPinned = pinnedMessageIds.includes(message.id);

		return (
			<Fragment key={message.id}>
				{divider}
				{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
				{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
				<MessageRow
					message={message}
					isMine={author?.id === currentUserId}
					isGroup={isGroup}
					isFirstOfRun={isFirstOfRun}
					isTimeAnchor={isTimeAnchor}
					clusterPosition={getClusterPosition(isFirstOfRun, isLastOfRun)}
					isTargeted={message.id === targetMessageId}
					isEditing={editingMessageId === message.id}
					receipt={readReceipt?.messageId === message.id ? readReceipt : null}
					currentUserId={currentUserId}
					participants={participants}
					isPinned={isPinned}
					{...actions}
				/>
			</Fragment>
		);
	});
});
