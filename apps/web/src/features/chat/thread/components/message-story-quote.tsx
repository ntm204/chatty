import type { StoryReplyDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { CONVERSATION_THEME_CLASSES } from "../../constants/conversation-theme";

interface MessageStoryQuoteProps {
	storyReply: StoryReplyDTO;
	/** True inside an outgoing bubble. */
	isMine: boolean;
}

/**
 * The story a message answers, as a small quote above it: a thumbnail or the
 * story's words on their colour while it lives, then just "Story expired" —
 * the reply outlives the story, the story does not.
 */
export function MessageStoryQuote({ storyReply, isMine }: MessageStoryQuoteProps) {
	const theme = storyReply.background ? CONVERSATION_THEME_CLASSES[storyReply.background] : null;

	return (
		<div
			className={cn(
				"mb-1.5 flex items-center gap-2.5 border-l-2 pl-2.5",
				isMine ? "border-block-ink/30" : "border-rule",
			)}
		>
			{storyReply.thumbUrl && (
				<img src={storyReply.thumbUrl} alt="" className="h-12 w-8 shrink-0 rounded-sm object-cover" />
			)}
			{theme && storyReply.text && (
				<span
					aria-hidden="true"
					className={cn(
						"flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm p-0.5 text-[7px]/[1.2]",
						theme.bubble,
						theme.bubbleInk,
					)}
				>
					{storyReply.text}
				</span>
			)}
			<span className="eyebrow opacity-70">
				{storyReply.isExpired ? "Note expired" : isMine ? "You replied to a note" : "Replied to your note"}
			</span>
		</div>
	);
}
