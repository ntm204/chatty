import type { PinnedMessageDTO } from "@chatty/shared-types";
import { ChevronDown, Pin } from "lucide-react";
import { useState } from "react";
import { getPinnedMessageAuthorLabel, getPinnedMessagePreview } from "../utils/pinned-message-preview";
import { Button } from "@/components/button";
import { PinnedMessagesDialog } from "./pinned-messages-dialog";

interface PinnedMessagesBannerProps {
	pinnedMessages: PinnedMessageDTO[];
	currentUserId: string;
	onOpenMessage: (messageId: string) => void;
}

/** Clicking the bar itself always jumps to the most recent pin; picking another one opens the full list. */
export function PinnedMessagesBanner({ pinnedMessages, currentUserId, onOpenMessage }: PinnedMessagesBannerProps) {
	const [isListOpen, setIsListOpen] = useState(false);
	const latest = pinnedMessages[0];
	if (!latest) return null;

	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-rule bg-paper-raised px-4 py-1 sm:px-5 md:px-7">
			<Pin className="size-3.5 shrink-0 text-ink-faint" />
			<Button
				variant="ghost"
				onClick={() => onOpenMessage(latest.messageId)}
				className="min-w-0 flex-1 flex-col items-start justify-center gap-0 text-left font-normal hover:bg-transparent"
			>
				<span className="text-xs text-ink-faint">{getPinnedMessageAuthorLabel(latest, currentUserId)}</span>
				<span className="min-w-0 max-w-full truncate text-sm text-ink">{getPinnedMessagePreview(latest)}</span>
			</Button>
			{pinnedMessages.length > 1 && (
				<Button
					variant="ghost"
					aria-label="Show pinned messages"
					aria-haspopup="dialog"
					aria-expanded={isListOpen}
					onClick={() => setIsListOpen(true)}
					className="size-8 shrink-0 p-0 hover:bg-transparent"
				>
					<ChevronDown className="size-4" />
				</Button>
			)}
			{isListOpen && (
				<PinnedMessagesDialog
					pinnedMessages={pinnedMessages}
					currentUserId={currentUserId}
					onClose={() => setIsListOpen(false)}
					onOpenMessage={(id) => {
						setIsListOpen(false);
						onOpenMessage(id);
					}}
				/>
			)}
		</div>
	);
}
