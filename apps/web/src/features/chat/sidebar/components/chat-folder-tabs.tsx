import type { KeyboardEvent } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CHAT_FOLDERS } from "../constants/conversation-list";
import type { ChatFolder, FolderSummary } from "../types/conversation-list";

interface ChatFolderTabsProps {
	folder: ChatFolder;
	summary: Record<ChatFolder, FolderSummary>;
	onChange: (folder: ChatFolder) => void;
}

/**
 * The four folders as one quiet track split into equal parts — the open one
 * lifts onto paper, the rest stay as text. Equal widths keep the row still as
 * folders are switched; a small dot marks every folder (but All) holding
 * something unread, the place to look without a number widening a part. Left
 * and right arrows move between folders, as in any tab row.
 */
export function ChatFolderTabs({ folder, summary, onChange }: ChatFolderTabsProps) {
	const folders = CHAT_FOLDERS;

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
			className="mx-4 mt-1 mb-2 grid shrink-0 grid-cols-4 gap-0.5 rounded-full bg-paper-sunken p-[3px]"
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
							"relative h-7 min-w-0 gap-1 rounded-full px-1 py-0 text-[12.5px] transition-[background-color,color,box-shadow]",
							isSelected
								? "bg-paper-raised font-semibold text-heading shadow-reaction hover:bg-paper-raised"
								: "font-medium text-ink-soft hover:bg-transparent hover:text-ink",
						)}
					>
						<span className="truncate">{option.label}</span>
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
