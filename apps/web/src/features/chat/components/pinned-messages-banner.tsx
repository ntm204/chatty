import type { PinnedMessageDTO } from "@chatty/shared-types";
import { ChevronDown, Pin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { getPinnedMessageAuthorLabel, getPinnedMessagePreview } from "../utils/pinned-message-preview";
import { Button } from "@/components/button";
import { PinnedMessagesDialog } from "./pinned-messages-dialog";
import { PINNED_BANNER_SEGMENTS } from "../constants/pinned-messages";

interface PinnedMessagesBannerProps {
	pinnedMessages: PinnedMessageDTO[];
	currentUserId: string;
	onOpenMessage: (messageId: string) => void;
}

/** Clicking the bar itself always jumps to the most recent pin; picking another one opens the full list. */
export function PinnedMessagesBanner({ pinnedMessages, currentUserId, onOpenMessage }: PinnedMessagesBannerProps) {
	const [isListOpen, setIsListOpen] = useState(false);
	// Which pin is on show: newest first; each click jumps to it, then moves to
	// the next older one, wrapping — Telegram's way through several pins.
	const [index, setIndex] = useState(0);
	const count = pinnedMessages.length;
	const shownIndex = count > 0 ? index % count : 0;
	const latest = pinnedMessages[shownIndex];
	if (!latest) return null;
	const segments = Math.min(count, PINNED_BANNER_SEGMENTS);
	// With more pins than segments, the lit segment walks a window over them.
	const litSegment = count <= segments ? shownIndex : Math.round((shownIndex / (count - 1)) * (segments - 1));

	return (
		<div className="pinned-messages-banner flex h-12 shrink-0 items-center gap-2 border-b border-rule-soft bg-paper-raised px-4 sm:px-5">
			{count > 1 ? (
				<span aria-hidden="true" className="flex h-7 w-0.5 shrink-0 flex-col gap-0.5">
					{Array.from({ length: segments }, (_, segment) => (
						<span
							key={segment}
							className={cn(
								"flex-1 rounded-full transition-colors",
								segment === litSegment ? "bg-heading" : "bg-rule",
							)}
						/>
					))}
				</span>
			) : (
				<Pin className="size-3.5 shrink-0 rotate-45 text-ink-faint" />
			)}
			<Button
				variant="ghost"
				aria-label={
					count > 1
						? `Pinned message ${shownIndex + 1} of ${count}: ${getPinnedMessagePreview(latest)}`
						: undefined
				}
				onClick={() => {
					onOpenMessage(latest.messageId);
					if (count > 1) setIndex(shownIndex + 1);
				}}
				className="h-full min-w-0 flex-1 justify-start gap-2 px-1 py-0 text-left font-normal hover:bg-transparent"
			>
				<span className="flex min-w-0 flex-col leading-tight">
					<span className="truncate text-[12px] font-semibold text-heading">
						{count > 1 ? `Pinned message #${count - shownIndex}` : "Pinned message"}
						<span className="ml-1.5 font-normal text-ink-faint">
							{getPinnedMessageAuthorLabel(latest, currentUserId)}
						</span>
					</span>
					<span key={latest.messageId} className="pinned-banner-text min-w-0 truncate text-[13px] text-ink">
						{getPinnedMessagePreview(latest)}
					</span>
				</span>
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
						// Carry on from the picked pin, as if it had been reached by clicking.
						const picked = pinnedMessages.findIndex((pin) => pin.messageId === id);
						if (picked >= 0) setIndex(picked + 1);
					}}
				/>
			)}
		</div>
	);
}
