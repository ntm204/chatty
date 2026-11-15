import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CHAT_FOLDERS } from "../constants/conversation-list";
import type { ChatFolder } from "../types/conversation-list";

interface ChatFolderTabsProps {
	folder: ChatFolder;
	/** How many chats have unread messages: a dot on the Unread tab, the number for screen readers. */
	unreadCount: number;
	onChange: (folder: ChatFolder) => void;
}

/**
 * The sidebar's folder tabs: a quiet underlined row, Telegram-style.
 *
 * Unread is a dot, not a count. A number widened one tab and pulled the row off
 * balance, and it repeated what every row's own badge already says; the dot sits
 * outside the label's box, so all four tabs keep the same rhythm whether or not
 * anything is unread.
 */
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
						<span className="relative">
							{option.label}
							{option.id === "unread" && unreadCount > 0 && (
								<>
									<span
										aria-hidden="true"
										className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-signal"
									/>
									<span className="sr-only">, {unreadCount} chats</span>
								</>
							)}
						</span>
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
