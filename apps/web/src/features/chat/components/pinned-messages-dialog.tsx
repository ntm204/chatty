import type { PinnedMessageDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { PinnedMessagesList } from "./pinned-messages-list";

interface PinnedMessagesDialogProps {
	pinnedMessages: PinnedMessageDTO[];
	currentUserId: string;
	onClose: () => void;
	onOpenMessage: (id: string) => void;
}

export function PinnedMessagesDialog({
	pinnedMessages,
	currentUserId,
	onClose,
	onOpenMessage,
}: PinnedMessagesDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Pinned messages"
				tabIndex={-1}
				// A fixed height rather than a max — a modal that grows and shrinks with
				// how many messages happen to be pinned reads as the interface
				// resizing itself under the reader. See conventions/frontend.md.
				className="flex h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Pinned messages</h2>
					<Button
						variant="ghost"
						aria-label="Close pinned messages"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				<div className="relative min-h-0 flex-1 overflow-y-auto">
					<PinnedMessagesList
						pinnedMessages={pinnedMessages}
						currentUserId={currentUserId}
						onOpenMessage={onOpenMessage}
					/>
				</div>
			</div>
		</div>
	);
}
