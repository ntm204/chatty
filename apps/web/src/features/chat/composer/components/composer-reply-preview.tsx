import type { MessageDTO } from "@chatty/shared-types";
import { CornerUpLeft, X } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT, PROTECTED_MESSAGE_TEXT } from "../../constants/message";
import { getAttachmentPreviewText } from "../../utils";

interface ComposerReplyPreviewProps {
	replyTo: MessageDTO;
	onCancel: () => void;
}

export function ComposerReplyPreview({ replyTo, onCancel }: ComposerReplyPreviewProps) {
	// Quoted as its cover even by its author, like everywhere a protected message is not opened.
	const thumbnail = replyTo.protection ? undefined : replyTo.attachments[0];

	return (
		<div className="flex items-start gap-2.5 rounded-panel bg-paper-sunken px-3 py-2">
			<CornerUpLeft aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="note text-ink-faint">
					Replying to {replyTo.author?.displayName ?? DELETED_AUTHOR_NAME}
				</span>
				<span className="font-content truncate text-[13px]/[1.45] text-ink-soft">
					{replyTo.deletedAt
						? DELETED_MESSAGE_TEXT
						: replyTo.protection
							? PROTECTED_MESSAGE_TEXT
							: replyTo.content ||
								(replyTo.attachments.length > 0 ? getAttachmentPreviewText(replyTo.attachments) : "")}
				</span>
			</div>
			{thumbnail && (
				<img
					src={thumbnail.url}
					alt=""
					className="ml-auto size-10 shrink-0 rounded-control border border-rule object-cover"
				/>
			)}
			<Button
				variant="ghost"
				onClick={onCancel}
				aria-label="Cancel reply"
				className={cn(
					"size-6 shrink-0 p-0 text-ink-faint hover:bg-transparent hover:text-ink",
					!thumbnail && "ml-auto",
				)}
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}
