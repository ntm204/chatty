import type { ConversationDTO } from "@chatty/shared-types";
import { Bookmark } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/button";
import { BookmarkedMessagesDialog } from "./bookmarked-messages-dialog";

interface BookmarksShortcutProps {
	currentUserId: string;
	onSelectMessage: (conversation: ConversationDTO, messageId: string) => void;
}

export function BookmarksShortcut({ currentUserId, onSelectMessage }: BookmarksShortcutProps) {
	const [isOpen, setIsOpen] = useState(false);
	const close = useCallback(() => setIsOpen(false), []);

	return (
		<div className="px-3 pb-2">
			<Button
				variant="ghost"
				onClick={() => setIsOpen(true)}
				className="w-full justify-start gap-2 px-3 text-xs text-ink-soft"
			>
				<Bookmark className="size-4" />
				Bookmarked messages
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
