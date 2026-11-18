import type { StoryDTO, StoryLikeDTO } from "@chatty/shared-types";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getErrorMessage } from "@/utils/get-error-message";
import { STORY_AUDIENCE_OPTIONS } from "../constants/stories";
import { NoteSheetFrame } from "./note-sheet-frame";

interface MyNoteSheetProps {
	note: StoryDTO;
	onNewNote: () => void;
	onDeleted: (noteId: string) => void;
	onClose: () => void;
}

/** Your own note: who liked it, who it is shared with, and Messenger's two actions — a new note, or delete. */
export function MyNoteSheet({ note, onNewNote, onDeleted, onClose }: MyNoteSheetProps) {
	const [likes, setLikes] = useState<StoryLikeDTO[] | null>(null);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState("");
	const audience = STORY_AUDIENCE_OPTIONS.find((option) => option.value === note.audience)?.label;

	useEffect(() => {
		let isCurrent = true;
		api.listStoryLikes(note.id)
			.then((list) => isCurrent && setLikes(list))
			.catch(() => isCurrent && setLikes([]));

		return () => {
			isCurrent = false;
		};
	}, [note.id, note.likeCount]);

	async function remove() {
		setIsDeleting(true);
		setError("");
		try {
			await api.deleteStory(note.id);
			onDeleted(note.id);
			onClose();
		} catch (deleteError) {
			setError(getErrorMessage(deleteError, "The note could not be deleted. Try again."));
			setIsDeleting(false);
		}
	}

	return (
		<NoteSheetFrame note={note} label="Your note" title="Your note" onClose={onClose}>
			{audience && <p className="note -mt-2 text-center text-ink-soft">Shared with {audience.toLowerCase()}</p>}

			<section aria-labelledby="note-likes-heading" className="flex flex-col gap-1">
				<h3 id="note-likes-heading" className="meta flex items-center gap-1.5 text-ink-soft">
					<Heart aria-hidden="true" className="size-3.5" />
					{likes && likes.length > 0 ? `Liked by ${likes.length}` : "Likes"}
				</h3>
				{likes === null ? null : likes.length === 0 ? (
					<p className="note text-ink-faint">No likes yet.</p>
				) : (
					<ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
						{likes.map((like) => (
							<li key={like.user.id} className="flex items-center gap-3 py-1">
								<Avatar user={like.user} size="sm" />
								<span className="min-w-0 truncate text-sm text-ink">{like.user.displayName}</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<div className="flex flex-col gap-2">
				<Button onClick={onNewNote} className="w-full">
					Leave a new note
				</Button>
				<Button variant="ghost" onClick={() => setIsConfirmingDelete(true)} className="w-full text-signal">
					Delete note
				</Button>
			</div>

			{isConfirmingDelete && (
				<ConfirmDialog
					title="Delete note?"
					body="It disappears for everyone now. Replies already sent stay in your chats."
					confirmLabel="Delete note"
					isConfirming={isDeleting}
					error={error}
					onConfirm={() => void remove()}
					onCancel={() => setIsConfirmingDelete(false)}
				/>
			)}
		</NoteSheetFrame>
	);
}
