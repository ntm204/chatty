import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CHAT_FOLDERS } from "../constants/chat-folders";
import type { ChatFolder } from "../types/chat-folder";

interface ChatFolderTabsProps {
	folder: ChatFolder;
	/** How many chats have unread messages, shown on the Unread tab. */
	unreadCount: number;
	onChange: (folder: ChatFolder) => void;
}

/** The sidebar's folder tabs: a quiet underlined row, Telegram-style. */
export function ChatFolderTabs({ folder, unreadCount, onChange }: ChatFolderTabsProps) {
	return (
		<div role="tablist" aria-label="Chat folders" className="flex shrink-0 gap-1 border-b border-rule-soft px-3">
			{CHAT_FOLDERS.map((option) => {
				const isSelected = option.id === folder;

				return (
					<Button
						key={option.id}
						variant="ghost"
						role="tab"
						aria-selected={isSelected}
						onClick={() => onChange(option.id)}
						className={cn(
							"relative h-9 gap-1.5 rounded-none px-2.5 py-0 text-[13px] hover:bg-transparent",
							isSelected ? "font-semibold text-heading" : "font-medium text-ink-faint hover:text-ink",
						)}
					>
						{option.label}
						{option.id === "unread" && unreadCount > 0 && (
							<span className="rounded-full bg-paper-sunken px-1.5 text-[11px] tabular-nums text-ink-soft">
								{unreadCount}
							</span>
						)}
						{isSelected && (
							<span
								aria-hidden="true"
								className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-heading"
							/>
						)}
					</Button>
				);
			})}
		</div>
	);
}
