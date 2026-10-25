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
				title="Messages bookmarked from your conversations"
				className="h-10 w-full justify-center gap-2 rounded-control bg-paper-sunken px-2 text-xs text-ink-soft hover:bg-ink/5"
			>
				<Bookmark className="size-4" />
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
