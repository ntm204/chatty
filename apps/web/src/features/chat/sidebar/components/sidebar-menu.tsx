import type { ConversationDTO } from "@chatty/shared-types";
import { Archive, Keyboard, MoreHorizontal, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { BookmarksShortcut } from "./bookmarks-shortcut";
import { SavedMessagesShortcut } from "./saved-messages-shortcut";

interface SidebarMenuProps {
	currentUserId: string;
	onOpenNotes: (id: string, conversation: ConversationDTO) => void;
	onOpenBookmarkedMessage: (conversation: ConversationDTO, messageId: string) => void;
	onShowArchived: () => void;
	onShowKeyboardShortcuts?: (() => void) | undefined;
	onShowFriends: () => void;
	/** Friend requests waiting for an answer: a dot on "⋯" and the number on the Friends row. */
	friendRequestCount: number;
}

/**
 * Everything the sidebar offers that is not a chat, behind one "⋯": friends,
 * notes, bookmarks, archived chats and the keyboard shortcuts. A row of chips and
 * three footer icons made the sidebar busier than the list it holds.
 *
 * The panel is hidden rather than unmounted when it closes: the bookmarks
 * dialog belongs to its row, and unmounting the row would close the dialog
 * the row just opened.
 */
export function SidebarMenu({
	currentUserId,
	onOpenNotes,
	onOpenBookmarkedMessage,
	onShowArchived,
	onShowKeyboardShortcuts,
	onShowFriends,
	friendRequestCount,
}: SidebarMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		function closeFromOutside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
		}
		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === "Escape") setIsOpen(false);
		}
		document.addEventListener("pointerdown", closeFromOutside);
		document.addEventListener("keydown", closeOnEscape);

		return () => {
			document.removeEventListener("pointerdown", closeFromOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [isOpen]);

	return (
		<div ref={rootRef} className="relative">
			<Button
				variant="ghost"
				onClick={() => setIsOpen((current) => !current)}
				aria-label={friendRequestCount > 0 ? `More, ${friendRequestCount} friend requests` : "More"}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className="relative size-9 rounded-full p-0 text-ink-soft hover:bg-paper-sunken hover:text-ink"
			>
				<MoreHorizontal className="size-[18px]" />
				{friendRequestCount > 0 && (
					<span
						aria-hidden="true"
						className="absolute top-1.5 right-1.5 size-2 rounded-full bg-signal ring-2 ring-paper-raised"
					/>
				)}
			</Button>
			<div
				role="menu"
				aria-label="More"
				hidden={!isOpen}
				// Choosing anything closes the panel; the row then does its own work.
				onClickCapture={() => setIsOpen(false)}
				className={cn(
					"popover-enter absolute top-full right-0 z-40 mt-1.5 w-52 rounded-2xl bg-paper-raised p-1.5 shadow-lift",
				)}
			>
				<Button
					variant="ghost"
					role="menuitem"
					onClick={onShowFriends}
					className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-ink hover:bg-paper-sunken"
				>
					<Users className="size-4 text-ink-faint" />
					<span className="flex-1 text-left">Friends</span>
					{friendRequestCount > 0 && (
						<span className="min-w-5 rounded-full bg-signal px-1.5 text-center text-[11px] font-semibold text-paper">
							{friendRequestCount}
						</span>
					)}
				</Button>
				<SavedMessagesShortcut userId={currentUserId} onOpen={onOpenNotes} />
				<BookmarksShortcut currentUserId={currentUserId} onSelectMessage={onOpenBookmarkedMessage} />
				<Button
					variant="ghost"
					role="menuitem"
					onClick={onShowArchived}
					className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-ink hover:bg-paper-sunken"
				>
					<Archive className="size-4 text-ink-faint" />
					Archived chats
				</Button>
				{onShowKeyboardShortcuts && (
					<Button
						variant="ghost"
						role="menuitem"
						onClick={onShowKeyboardShortcuts}
						className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-ink hover:bg-paper-sunken"
					>
						<Keyboard className="size-4 text-ink-faint" />
						Keyboard shortcuts
					</Button>
				)}
			</div>
		</div>
	);
}
