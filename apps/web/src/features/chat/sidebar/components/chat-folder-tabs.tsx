import type { KeyboardEvent } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CHAT_FOLDERS } from "../constants/conversation-list";
import type { ChatFolder, FolderSummary } from "../types/conversation-list";
import { visibleFolders } from "../utils/summarize-folders";

interface ChatFolderTabsProps {
	folder: ChatFolder;
	summary: Record<ChatFolder, FolderSummary>;
	onChange: (folder: ChatFolder) => void;
}

/**
 * The sidebar's folders as Messenger's soft chips: the open one filled, the
 * rest plain text until hovered.
 *
 * Smart about what it shows: Groups and Direct appear only once they hold a
 * chat, and a small dot marks every folder (but All) holding something unread —
 * the place to look, without a number widening the chip. Left and right arrows
 * move between folders, as in any tab row.
 */
export function ChatFolderTabs({ folder, summary, onChange }: ChatFolderTabsProps) {
	const folders = CHAT_FOLDERS.filter(({ id }) => visibleFolders(summary, folder).includes(id));

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		event.preventDefault();
		const index = folders.findIndex(({ id }) => id === folder);
		const next = folders[(index + (event.key === "ArrowRight" ? 1 : -1) + folders.length) % folders.length]!;
		onChange(next.id);
		event.currentTarget.querySelector<HTMLElement>(`[data-folder="${next.id}"]`)?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Chat folders"
			onKeyDown={onKeyDown}
			className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-1 pb-2 scrollbar-none"
		>
			{folders.map((option) => {
				const isSelected = option.id === folder;
				const unread = summary[option.id].unread;
				const hasDot = option.id !== "all" && unread > 0;

				return (
					<Button
						key={option.id}
						variant="ghost"
						role="tab"
						aria-selected={isSelected}
						tabIndex={isSelected ? 0 : -1}
						data-folder={option.id}
						onClick={() => onChange(option.id)}
						className={cn(
							"relative h-8 shrink-0 gap-1.5 rounded-full px-3.5 py-0 text-[13px] transition-colors",
							isSelected
								? "bg-selection font-semibold text-heading hover:bg-selection"
								: "font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink",
						)}
					>
						{option.label}
						{hasDot && (
							<>
								<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-signal" />
								<span className="sr-only">
									, {unread} {unread === 1 ? "chat" : "chats"}
								</span>
							</>
						)}
					</Button>
				);
			})}
		</div>
	);
}
