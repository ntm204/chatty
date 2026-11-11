import type { ConversationDTO } from "@chatty/shared-types";
import { Bookmark } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/button";
import { BookmarkedMessagesDialog } from "./bookmarked-messages-dialog";
import { useBackDismiss } from "@/hooks/use-back-dismiss";

interface BookmarksShortcutProps {
	currentUserId: string;
	onSelectMessage: (conversation: ConversationDTO, messageId: string) => void;
}

export function BookmarksShortcut({ currentUserId, onSelectMessage }: BookmarksShortcutProps) {
	const [isOpen, setIsOpen] = useState(false);
	const close = useCallback(() => setIsOpen(false), []);
	useBackDismiss(isOpen, close);

	return (
		<div className="min-w-0">
			<Button
				variant="ghost"
				onClick={() => setIsOpen(true)}
				aria-label="Bookmarked messages"
				data-tooltip="Messages bookmarked from your conversations"
				role="menuitem"
				className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-ink hover:bg-paper-sunken"
			>
				<Bookmark className="size-4 text-ink-faint" />
				Bookmarks
			</Button>
			{isOpen &&
				createPortal(
					<BookmarkedMessagesDialog
						currentUserId={currentUserId}
						onClose={close}
						onSelectMessage={(conversation, messageId) => {
							onSelectMessage(conversation, messageId);
							close();
						}}
					/>,
					document.body,
				)}
		</div>
	);
}
