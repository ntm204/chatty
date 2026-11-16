import type { NoteMusicDTO, UserDTO } from "@chatty/shared-types";
import { Music, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { NoteBubble } from "./note-bubble";

interface StoryRingProps {
	user: UserDTO;
	label: string;
	/** The word under the face; defaults to the person's name. */
	caption?: string;
	/** Words for the bubble above the face; none leaves the space empty so faces stay in line. */
	noteText?: string | null;
	/** The song on the note, shown as a line under its words. */
	music?: NoteMusicDTO | null;
	/** Your own tile with nothing posted: a faint "Note…" bubble invites one. */
	hasNotePrompt?: boolean;
	/** "unseen" draws the accent ring, "seen" a quiet one, "none" no ring at all. */
	state: "unseen" | "seen" | "none";
	/** Your own tile: a small plus to post another story. */
	hasAddBadge?: boolean;
	isMine?: boolean;
	onClick: () => void;
}

/** One face in the stories row, with its note in a message bubble above it. The ring is the "new" signal. */
export function StoryRing({
	user,
	label,
	caption,
	noteText,
	music = null,
	hasNotePrompt = false,
	state,
	hasAddBadge = false,
	isMine = false,
	onClick,
}: StoryRingProps) {
	const thought = noteText ?? "";

	return (
		<Button
			variant="ghost"
			onClick={onClick}
			aria-label={label}
			className="flex h-auto w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl p-0.5 font-normal hover:bg-transparent"
		>
			{/* A fixed slot: faces line up whether or not someone has a note. */}
			<span className="flex h-10 w-full items-end justify-center px-1">
				{thought || music ? (
					<NoteBubble isMine={isMine} size="sm" className="flex max-w-full min-w-0 flex-col items-center">
						{thought && (
							<span
								className={cn(
									"text-center text-[11px]/[1.3] font-medium wrap-break-word",
									// With a song under it, one line keeps the bubble inside its slot.
									music ? "line-clamp-1" : "line-clamp-2",
								)}
							>
								{thought}
							</span>
						)}
						{music && (
							<span className="flex max-w-full min-w-0 items-center gap-0.5 text-[10px]/[1.3] opacity-75">
								<Music aria-hidden="true" className="size-2.5 shrink-0" />
								<span className="truncate">{music.title}</span>
							</span>
						)}
					</NoteBubble>
				) : hasNotePrompt ? (
					<NoteBubble isMine={false} size="sm">
						<span className="text-[11px]/[1.3] text-ink-faint">Note…</span>
					</NoteBubble>
				) : null}
			</span>

			<span
				className={cn(
					"relative rounded-full p-[2px]",
					state === "unseen" && "bg-signal",
					state === "seen" && "bg-rule",
				)}
			>
				<span className="block rounded-full bg-paper-raised p-[2px]">
					<Avatar user={user} size="md" />
				</span>
				{hasAddBadge && (
					<span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-paper-raised bg-ink text-paper-raised">
						<Plus aria-hidden="true" className="size-2.5" strokeWidth={3} />
					</span>
				)}
			</span>
			<span className="meta w-full truncate text-center text-ink-soft">{caption ?? user.displayName}</span>
		</Button>
	);
}
