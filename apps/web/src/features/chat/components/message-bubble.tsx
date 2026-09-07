import { cn } from "@/utils/cn";
import { STICKER_DISPLAY_SIZE } from "../constants/attachment";
import { getConversationThemeClasses } from "../constants/conversation-theme";
import { INCOMING_BUBBLE_RADIUS, OUTGOING_BUBBLE_RADIUS } from "../constants/message-cluster";
import { useCompactMessage } from "../hooks/use-compact-message";
import type { ClusterPosition } from "../types/message-cluster";
import type { ThreadMessage } from "../types/thread-message";
import { formatMessageTime } from "../utils/format-time";
import { MessageGallery } from "./message-gallery";
import { MessageFileCard } from "./message-file-card";
import { MessageReplyQuote } from "./message-reply-quote";
import { MessageText } from "./message-text";
import { VoicePlayer } from "./voice-player";
import type { ConversationTheme, ParticipantDTO } from "@chatty/shared-types";

interface MessageBubbleProps {
	message: ThreadMessage;
	isMine: boolean;
	clusterPosition: ClusterPosition;
	/**
	 * How many emoji this message is, when it is *only* emoji — zero otherwise.
	 * Decided by the row, which is where the conditions that disqualify a message
	 * (a reply, a picture, a tombstone) are already known.
	 */
	jumboCount: number;
	onJumpToReplyOriginal: () => void;
	participants: ParticipantDTO[];
	/** The conversation's shared accent, replacing the fixed default for "mine" surfaces — see ADR 0022. */
	themeColor: ConversationTheme | null;
	/**
	 * Forwards this message from inside the image viewer. Optional and omitted
	 * for a message nothing may act on yet — one still on its way has no server
	 * id for a forward to name.
	 */
	onForward?: () => void;
}

/**
 * What a message that still stands looks like: its quote, its pictures, its
 * words, and the shape around them.
 *
 * Split out of `MessageRow` when that file went over the 300-line limit. The
 * row keeps everything *about* the message — the avatar, the byline, the run
 * position, the gutter, the actions — and this holds the one thing that is the
 * message.
 *
 * **A message that is nothing but a few emoji gets no bubble at all**: no fill,
 * no border, no radius, and type several times the size. At bubble size an
 * emoji reads as a typo, and the bubble is chrome around content that does not
 * need explaining. The surrounding stationery stays separate from user content.
 */
export function MessageBubble({
	message,
	isMine,
	clusterPosition,
	jumboCount,
	onJumpToReplyOriginal,
	participants,
	themeColor,
	onForward,
}: MessageBubbleProps) {
	const theme = getConversationThemeClasses(themeColor);
	const images = message.attachments.filter((attachment) => attachment.kind === "image");
	const file = message.attachments.find((attachment) => attachment.kind === "file");
	const voice = message.attachments.find((attachment) => attachment.kind === "audio");
	const hasImages = images.length > 0;
	const sticker = message.isSticker ? images[0] : undefined;
	const bubbleRef = useCompactMessage(
		message.content,
		message.attachments.length === 0 &&
			!message.replyTo &&
			!message.isForwarded &&
			message.mentionedUserIds.length === 0 &&
			jumboCount === 0,
	);

	// A sticker gets no bubble, for the same reason a message of pure emoji does
	// not: the picture *is* the message, and a fill around it is chrome around
	// content that needs no explaining. Drawn at a fixed size rather than its own
	// — a tray of mixed shapes would otherwise make every sticker a different
	// size in the thread.
	if (sticker) {
		return (
			<img
				src={sticker.url}
				alt="Sticker"
				loading="lazy"
				width={STICKER_DISPLAY_SIZE}
				height={STICKER_DISPLAY_SIZE}
				className="object-contain"
			/>
		);
	}

	// A caption belongs to the media, not a second tail-aligned bubble. It stays
	// out of the thread and appears in full at the top of the opened picture.
	if (hasImages) {
		return (
			<div className={cn("flex min-w-0 flex-col gap-1.5", isMine ? "items-end" : "items-start")}>
				{message.isForwarded && <span className="eyebrow text-ink-faint">Forwarded</span>}
				{message.replyTo && (
					<MessageReplyQuote
						replyTo={message.replyTo}
						isMine={isMine}
						onJumpToOriginal={onJumpToReplyOriginal}
					/>
				)}

				<MessageGallery
					attachments={images}
					caption={message.content}
					{...(message.deliveryState ? {} : { timeLabel: formatMessageTime(message.createdAt) })}
					{...(onForward && { onForward })}
				/>
			</div>
		);
	}

	if (file || voice) {
		return (
			<div className={cn("flex min-w-0 flex-col gap-1.5", isMine ? "items-end" : "items-start")}>
				{message.isForwarded && <span className="eyebrow text-ink-faint">Forwarded</span>}
				{message.replyTo && (
					<MessageReplyQuote
						replyTo={message.replyTo}
						isMine={isMine}
						onJumpToOriginal={onJumpToReplyOriginal}
					/>
				)}
				{file ? (
					<MessageFileCard attachment={file} />
				) : voice ? (
					<VoicePlayer attachment={voice} isMine={isMine} themeColor={themeColor} />
				) : null}
				{message.content && (
					<MessageText
						content={message.content}
						mentionedUserIds={message.mentionedUserIds}
						participants={participants}
						className="max-w-80 whitespace-pre-wrap text-sm/[1.55] wrap-break-word"
					/>
				)}
			</div>
		);
	}

	return (
		<div
			ref={bubbleRef}
			className={cn(
				"min-w-0 max-w-full text-sm/[1.55]",
				jumboCount > 0
					? "bg-transparent px-1 py-0.5"
					: cn(
							isMine ? cn(theme.bubble, theme.bubbleInk) : "bg-paper-sunken text-ink",
							(isMine ? OUTGOING_BUBBLE_RADIUS : INCOMING_BUBBLE_RADIUS)[clusterPosition],
							"chat-bubble px-3 py-1.5",
						),
			)}
		>
			{message.isForwarded && <span className="eyebrow mb-1 block opacity-65">Forwarded</span>}
			{message.replyTo && (
				<MessageReplyQuote replyTo={message.replyTo} isMine={isMine} onJumpToOriginal={onJumpToReplyOriginal} />
			)}

			{message.content && (
				<MessageText
					content={message.content}
					mentionedUserIds={message.mentionedUserIds}
					participants={participants}
					className={cn(
						"whitespace-pre-wrap wrap-anywhere text-pretty",
						// Smaller as the count grows, so three still fit the column a
						// bubble would have occupied.
						jumboCount === 1 && "text-[44px] leading-[1.15]",
						jumboCount === 2 && "text-[38px] leading-[1.15]",
						jumboCount === 3 && "text-[32px] leading-[1.15]",
					)}
				/>
			)}
		</div>
	);
}
