import type { StoryDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { formatRelativeTime } from "../../utils";
import { NoteMusicBadge } from "./note-music-badge";
import { NoteThoughtBubble } from "./note-thought-bubble";

interface NoteSheetFrameProps {
	note: StoryDTO;
	label: string;
	/** "Your note" on your own; the author's name otherwise. */
	title: string;
	onClose: () => void;
	children: ReactNode;
}

/**
 * The sheet a note opens in — from the bottom on a phone, centred on a wide
 * screen: the note large over its author's face, with the song playing while
 * it is open, and whatever the sheet is for underneath.
 */
export function NoteSheetFrame({ note, label, title, onClose, children }: NoteSheetFrameProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);

	return (
		<div
			className="backdrop-fade fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 sm:items-center sm:p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={label}
				tabIndex={-1}
				className="dialog-enter relative flex max-h-[92vh] w-full flex-col gap-4 overflow-y-auto rounded-t-panel bg-paper-raised px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-modal outline-none sm:max-w-sm sm:rounded-panel"
			>
				<Button
					variant="ghost"
					aria-label="Close note"
					onClick={onClose}
					className="absolute top-3 right-3 size-8 p-0"
				>
					<X className="size-4" />
				</Button>

				<div className="flex flex-col items-center gap-2 pt-4">
					<NoteThoughtBubble size="lg" className="max-w-[260px]">
						{note.text && (
							<p className="font-content text-center text-base/[1.4] font-medium whitespace-pre-wrap wrap-anywhere">
								{note.text}
							</p>
						)}
						{note.music && (
							<div className={note.text ? "mt-2.5 flex justify-center" : "flex justify-center"}>
								<NoteMusicBadge track={note.music} isAutoPlaying />
							</div>
						)}
					</NoteThoughtBubble>
					<Avatar user={note.author} size="lg" />
					<p className="text-sm">
						<span className="font-semibold text-ink">{title}</span>
						<span className="meta ml-1.5 text-ink-soft">{formatRelativeTime(note.createdAt)}</span>
					</p>
				</div>

				{children}
			</div>
		</div>
	);
}
