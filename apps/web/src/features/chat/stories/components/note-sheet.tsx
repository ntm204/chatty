import type { StoryDTO } from "@chatty/shared-types";
import { ArrowUp, Heart } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/get-error-message";
import { NoteSheetFrame } from "./note-sheet-frame";

interface NoteSheetProps {
	note: StoryDTO;
	onLikeChange: (note: StoryDTO, isLiked: boolean) => void;
	onClose: () => void;
}

/**
 * Someone else's note: a heart, or a reply that lands in your chat with them —
 * Messenger's two answers to a note. The heart turns into a send button while
 * there is something typed, as it does there.
 */
export function NoteSheet({ note, onLikeChange, onClose }: NoteSheetProps) {
	const [content, setContent] = useState("");
	const [status, setStatus] = useState("");
	const [isSending, setIsSending] = useState(false);
	const hasDraft = content.trim().length > 0;

	async function send() {
		if (!hasDraft || isSending) return;
		setIsSending(true);
		setStatus("");
		try {
			await api.replyToStory(note.id, content.trim());
			setContent("");
			setStatus(`Sent to ${note.author.displayName}`);
		} catch (error) {
			setStatus(getErrorMessage(error, "The reply could not be sent. Try again."));
		} finally {
			setIsSending(false);
		}
	}

	return (
		<NoteSheetFrame
			note={note}
			label={`${note.author.displayName}'s note`}
			title={note.author.displayName}
			onClose={onClose}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void send();
				}}
				className="flex items-center gap-2"
			>
				<input
					value={content}
					onChange={(event) => setContent(event.target.value)}
					maxLength={4000}
					placeholder={`Reply to ${note.author.displayName}…`}
					aria-label="Reply to note"
					className="min-w-0 flex-1 rounded-full border border-rule bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint"
				/>
				{hasDraft ? (
					<Button
						type="submit"
						disabled={isSending}
						aria-label="Send reply"
						className="size-10 shrink-0 rounded-full p-0"
					>
						<ArrowUp className="size-4" />
					</Button>
				) : (
					<Button
						variant="ghost"
						onClick={() => onLikeChange(note, !note.isLiked)}
						aria-label={note.isLiked ? "Unlike note" : "Like note"}
						aria-pressed={note.isLiked}
						className="size-10 shrink-0 rounded-full p-0"
					>
						<Heart className={cn("size-6", note.isLiked ? "fill-signal text-signal" : "text-ink")} />
					</Button>
				)}
			</form>
			{status && (
				<p role="status" className="note -mt-2 text-center text-ink-soft">
					{status}
				</p>
			)}
		</NoteSheetFrame>
	);
}
