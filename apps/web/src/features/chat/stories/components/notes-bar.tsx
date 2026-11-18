import type { CurrentUserDTO, StoryDTO } from "@chatty/shared-types";
import { useState } from "react";
import { useStories } from "../hooks/use-stories";
import { latestNotes } from "../utils/latest-notes";
import { MyNoteSheet } from "./my-note-sheet";
import { NoteComposer } from "./note-composer";
import { NoteSheet } from "./note-sheet";
import { NoteTile } from "./note-tile";

interface NotesBarProps {
	currentUser: CurrentUserDTO;
}

/**
 * Messenger's notes row above the chats: your note first, then one note per
 * person you chat with, newest first. Tapping opens the note; your own tile
 * opens yours, or the composer when you have none.
 */
export function NotesBar({ currentUser }: NotesBarProps) {
	const { feed, markViewed, upsertMine, setLiked, removeMine } = useStories(currentUser.id);
	const [openNoteId, setOpenNoteId] = useState<string | null>(null);
	const [isComposing, setIsComposing] = useState(false);
	const [isMineOpen, setIsMineOpen] = useState(false);
	const myNote = feed.mine.at(-1) ?? null;
	const notes = latestNotes(feed.authors);
	// Looked up live, so a heart or a refetch shows in the open sheet, and a note that expires closes it.
	const openNote = notes.find((note) => note.id === openNoteId) ?? null;

	function open(note: StoryDTO) {
		markViewed(note);
		setOpenNoteId(note.id);
	}

	return (
		<>
			<div
				role="group"
				aria-label="Notes"
				className="flex shrink-0 gap-1 overflow-x-auto px-0.5 pt-0.5 pb-1 scrollbar-none"
			>
				<NoteTile
					user={currentUser}
					note={myNote}
					isMine
					label={myNote ? "Your note" : "New note"}
					caption="Your note"
					onClick={() => (myNote ? setIsMineOpen(true) : setIsComposing(true))}
				/>
				{notes.map((note) => (
					<NoteTile
						key={note.id}
						user={note.author}
						note={note}
						label={`${note.author.displayName}'s note`}
						caption={note.author.displayName}
						onClick={() => open(note)}
					/>
				))}
			</div>

			{openNote && <NoteSheet note={openNote} onLikeChange={setLiked} onClose={() => setOpenNoteId(null)} />}
			{isMineOpen && myNote && (
				<MyNoteSheet
					note={myNote}
					onNewNote={() => {
						setIsMineOpen(false);
						setIsComposing(true);
					}}
					onDeleted={removeMine}
					onClose={() => setIsMineOpen(false)}
				/>
			)}
			{isComposing && (
				<NoteComposer
					currentUser={currentUser}
					hasNote={myNote !== null}
					onPosted={upsertMine}
					onClose={() => setIsComposing(false)}
				/>
			)}
		</>
	);
}
