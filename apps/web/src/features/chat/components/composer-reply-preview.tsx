import type { MessageDTO } from "@chatty/shared-types";
import { CornerUpLeft, X } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME } from "../constants/message";
import { getAttachmentPreviewText } from "../utils";

interface ComposerReplyPreviewProps {
	replyTo: MessageDTO;
	onCancel: () => void;
}

export function ComposerReplyPreview({ replyTo, onCancel }: ComposerReplyPreviewProps) {
	return (
		<div className="flex items-start gap-2.5 rounded-panel bg-paper-sunken px-3 py-2">
			<CornerUpLeft aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="eyebrow text-ink-faint">
					Replying to {replyTo.author?.displayName ?? DELETED_AUTHOR_NAME}
				</span>
				<span className="truncate text-[12.5px]/[1.45] text-ink-soft">
					{replyTo.content ||
						(replyTo.attachments.length > 0 ? getAttachmentPreviewText(replyTo.attachments) : "")}
				</span>
			</div>
			{replyTo.attachments[0] && (
				<img
					src={replyTo.attachments[0].url}
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
					replyTo.attachments.length === 0 && "ml-auto",
				)}
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}
