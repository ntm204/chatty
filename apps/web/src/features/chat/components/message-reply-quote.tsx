import type { MessageReplyDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT, IMAGE_ONLY_QUOTE_TEXT } from "../constants/message";

interface MessageReplyQuoteProps {
	replyTo: MessageReplyDTO;
	/** True inside an outgoing bubble, where the ink is the ground and paper is the ink. */
	isMine: boolean;
	onJumpToOriginal: () => void;
}

/**
 * The message being answered, quoted inside the bubble that answers it.
 *
 * A rule and two lines of type — no nested card, no fill, no second radius. A
 * tinted rounded box inside a rounded bubble is two containers deep for one line
 * of text, and it is the thing that makes most chat apps' replies look bolted on.
 *
 * The quote is clamped to a single line on purpose: it is a pointer, not a
 * quotation. Three lines of somebody else's message above a two-word answer
 * inverts which of the two you are meant to read.
 */
export function MessageReplyQuote({ replyTo, isMine, onJumpToOriginal }: MessageReplyQuoteProps) {
	// Deleted first: the server empties the content of a tombstone, so without
	// this branch the quote would render as an empty rule with a name over it.
	const isUnavailable = replyTo.isDeleted;
	const preview = isUnavailable
		? DELETED_MESSAGE_TEXT
		: replyTo.content || (replyTo.hasAttachment ? IMAGE_ONLY_QUOTE_TEXT : "");
	const quoteClassName = cn(
		"mb-1.5 mt-px flex w-full min-w-0 flex-col items-start gap-0.5 rounded-none px-0 py-0 text-left",
		"border-l-2 pl-2.5",
		isMine ? "border-block-ink/30" : "border-rule",
	);
	const quote = (
		<>
			<span className={cn("note font-content font-medium", isMine ? "text-block-ink/60" : "text-ink-faint")}>
				{replyTo.authorName ?? DELETED_AUTHOR_NAME}
			</span>
			<span className="flex w-full min-w-0 items-center gap-2.5">
				{replyTo.attachmentUrl && !isUnavailable && (
					<img
						src={replyTo.attachmentUrl}
						alt=""
						className={cn(
							"size-9 shrink-0 rounded-control border object-cover",
							isMine ? "border-block-ink/20" : "border-rule",
						)}
					/>
				)}
				<span
					className={cn(
						"font-content min-w-0 flex-1 truncate text-[13px]/[1.45]",
						isMine ? "text-block-ink/70" : "text-ink-faint",
						isUnavailable && "italic",
					)}
				>
					{preview}
				</span>
			</span>
		</>
	);

	// A tombstone is already the complete, useful answer: there is no original
	// content left to reveal. Keeping it as a button would promise a jump that
	// can only end in another tombstone or an unavailable-context error.
	if (isUnavailable) {
		return (
			<div role="note" className={quoteClassName} aria-label="Original message was deleted">
				{quote}
			</div>
		);
	}

	return (
		<Button
			variant="ghost"
			onClick={onJumpToOriginal}
			aria-label="Jump to original message"
			className={cn(
				// Almost every Button default is undone here, and that is the right
				// trade: this is a button by behaviour — it jumps to the original —
				// but a quotation by appearance. Going through the component keeps the
				// focus ring and the `type="button"` default, which is the half that
				// has actually caused bugs in this app.
				quoteClassName,
				"hover:bg-transparent",
			)}
		>
			{quote}
		</Button>
	);
}
