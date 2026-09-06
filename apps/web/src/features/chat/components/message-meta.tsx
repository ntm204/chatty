import { cn } from "@/utils/cn";
import { Button } from "@/components/button";
import { EDITED_MESSAGE_LABEL } from "../constants/message";
import type { MessageDeliveryState } from "../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { formatMessageTime } from "../utils";
import { MessageDeliveryStatus } from "./message-delivery-status";

interface MessageMetaProps {
	createdAt: string;
	isMine: boolean;
	isEdited: boolean;
	/**
	 * Whether the bubble states its own time. True for a picture, which carries
	 * it in a chip on the image — the gutter is centred on the bubble, so beside
	 * a tall photograph its number would sit level with nothing.
	 */
	hasTimeOnMedia: boolean;
	/** Only used to decide whether this row needs any gutter at all on mobile. */
	receipt: ReadReceipt | null;
	deliveryState: MessageDeliveryState | undefined;
	onShowHistory: () => void;
	onRetrySend: () => void;
	onDiscardDraft: () => void;
}

/**
 * The gutter beside a bubble: its time, its edited marker, and — while it is
 * being sent — what is happening to it. The read receipt lives below the
 * bubble instead — see `MessageSentCaption`.
 *
 * Split out of `MessageRow` when that file went over the 300-line limit.
 *
 * The container reserves its width whether or not anything in it is currently
 * shown, and that is the entire trick — revealing a timestamp on hover must not
 * reflow the thread it sits in.
 */
export function MessageMeta({
	createdAt,
	isMine,
	isEdited,
	hasTimeOnMedia,
	receipt,
	deliveryState,
	onShowHistory,
	onRetrySend,
	onDiscardDraft,
}: MessageMetaProps) {
	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center gap-2",
				"max-sm:absolute max-sm:top-full max-sm:mt-1",
				isMine ? "max-sm:right-0" : "max-sm:left-10",
				(hasTimeOnMedia || !isEdited) && !deliveryState && !receipt && "max-sm:hidden",
			)}
		>
			{isEdited && (
				<Button
					variant="ghost"
					onClick={onShowHistory}
					className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-faint hover:bg-transparent hover:text-ink-soft"
				>
					{EDITED_MESSAGE_LABEL}
				</Button>
			)}

			{/* A message still on its way has no send time to state: the one it
			    carries is this machine's guess, not the server's answer. */}
			{deliveryState ? (
				<MessageDeliveryStatus state={deliveryState} onRetry={onRetrySend} onDiscard={onDiscardDraft} />
			) : hasTimeOnMedia ? null : (
				<span className="meta text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
					{formatMessageTime(createdAt)}
				</span>
			)}
		</div>
	);
}
