import type { ConversationTheme, MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../../constants/conversation-theme";
import { formatMessageTime, getConversationPreview, resolveDisplayName } from "../../utils";

interface ConversationPreviewMessageProps {
	message: MessageDTO;
	isMine: boolean;
	/** In a group, the author's name over the first bubble of their run. */
	showsAuthor: boolean;
	participants: ParticipantDTO[];
	themeColor: ConversationTheme | null;
}

/**
 * One message in a conversation preview: read-only and light — the text (or
 * what an attachment is), the author in groups, the time. Not the full bubble:
 * a preview is for reading what arrived, not for acting on it.
 */
export function ConversationPreviewMessage({
	message,
	isMine,
	showsAuthor,
	participants,
	themeColor,
}: ConversationPreviewMessageProps) {
	if (message.kind === "system") {
		return (
			<p className="wallpaper-pill mx-auto my-1 w-fit max-w-[85%] rounded-full px-3 py-1 text-center text-[11px] text-ink-faint">
				{getConversationPreview(message)}
			</p>
		);
	}

	const theme = getConversationThemeClasses(themeColor);

	return (
		<div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
			{showsAuthor && message.author && (
				<span className="mb-0.5 ml-3 text-[11px] font-semibold text-ink-soft">
					{resolveDisplayName(participants, message.author)}
				</span>
			)}
			<p
				className={cn(
					"chat-bubble max-w-[82%] rounded-2xl px-3 py-1.5 text-[14px] leading-snug wrap-anywhere whitespace-pre-wrap",
					isMine
						? cn("rounded-br-md", theme.bubble, theme.bubbleInk)
						: "rounded-bl-md bg-paper-sunken text-ink",
					message.deletedAt && "italic opacity-70",
				)}
			>
				{getConversationPreview(message)}
				{/* Floated into the last line's free space, as Telegram sets its time. */}
				<span className="relative top-1.5 float-right ml-2.5 text-[11px] tabular-nums opacity-60">
					{formatMessageTime(message.createdAt)}
				</span>
			</p>
		</div>
	);
}
