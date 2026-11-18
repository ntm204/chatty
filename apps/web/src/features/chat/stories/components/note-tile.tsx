import type { StoryDTO, UserDTO } from "@chatty/shared-types";
import { Music, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { NoteThoughtBubble } from "./note-thought-bubble";

interface NoteTileProps {
	user: UserDTO;
	/** Null on your own tile before you have posted. */
	note: StoryDTO | null;
	isMine?: boolean;
	label: string;
	caption: string;
	onClick: () => void;
}

/** One face in the notes row with its note floating above it; your own tile invites one when empty. */
export function NoteTile({ user, note, isMine = false, label, caption, onClick }: NoteTileProps) {
	return (
		<Button
			variant="ghost"
			onClick={onClick}
			aria-label={label}
			className="flex h-auto w-[74px] shrink-0 flex-col items-center gap-0 rounded-xl px-0.5 pt-0 pb-1 font-normal hover:bg-transparent"
		>
			{/* A fixed slot: faces line up whether or not someone has a note. The bubble's tail
			    overlaps the top of the face, as on Messenger, so the row stays short. */}
			<span className="relative z-10 -mb-2 flex h-[42px] w-full items-end justify-center">
				{note ? (
					<NoteThoughtBubble size="sm" className="max-w-full min-w-0">
						{note.text && (
							<span
								className={
									note.music
										? "line-clamp-1 text-center text-[10.5px]/[1.3] wrap-break-word"
										: "line-clamp-2 text-center text-[10.5px]/[1.3] wrap-break-word"
								}
							>
								{note.text}
							</span>
						)}
						{note.music && (
							<span className="flex min-w-0 items-center justify-center gap-0.5 text-[10px]/[1.3] text-ink-soft">
								<Music aria-hidden="true" className="size-2.5 shrink-0" />
								<span className="truncate">{note.music.title}</span>
							</span>
						)}
					</NoteThoughtBubble>
				) : isMine ? (
					<NoteThoughtBubble size="sm" isPlaceholder>
						<span className="block text-center text-[10.5px]/[1.3] whitespace-nowrap">Note…</span>
					</NoteThoughtBubble>
				) : null}
			</span>
			<span className="relative">
				<Avatar user={user} size="md" />
				{isMine && !note && (
					<span className="absolute right-0 bottom-0 flex size-4 items-center justify-center rounded-full border-2 border-paper bg-ink text-paper">
						<Plus aria-hidden="true" className="size-2.5" strokeWidth={3} />
					</span>
				)}
			</span>
			<span className="mt-1 w-full truncate text-center text-[11px] leading-tight text-ink-soft">{caption}</span>
		</Button>
	);
}
