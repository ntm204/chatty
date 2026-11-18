import {
	NOTE_TEXT_MAX_LENGTH,
	type CurrentUserDTO,
	type NoteMusicDTO,
	type StoryAudience,
	type StoryDTO,
} from "@chatty/shared-types";
import { Music, Users, X } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { useDialog } from "@/hooks/use-dialog";
import { getErrorMessage } from "@/utils/get-error-message";
import { NOTE_LIFETIME_HOURS, STORY_AUDIENCE_OPTIONS } from "../constants/stories";
import { NoteMusicBadge } from "./note-music-badge";
import { NoteMusicPicker } from "./note-music-picker";
import { NoteThoughtBubble } from "./note-thought-bubble";
import { StoryAudienceDialog } from "./story-audience-dialog";

interface NoteComposerProps {
	currentUser: CurrentUserDTO;
	/** Your current note, if any: a new one replaces it, as on Messenger. */
	hasNote: boolean;
	onPosted: (note: StoryDTO) => void;
	onClose: () => void;
}

/**
 * Messenger's "New note": the thought typed straight into the bubble above
 * your face, up to 60 characters, a song if you like, who sees it — and Share.
 */
export function NoteComposer({ currentUser, hasNote, onPosted, onClose }: NoteComposerProps) {
	const close = useCallback(() => onClose(), [onClose]);
	// Escape belongs to the song picker while it is open, so this dialog does not take it.
	const dialogRef = useDialog<HTMLDivElement>(close, { closeOnEscape: false });
	const [text, setText] = useState("");
	const [music, setMusic] = useState<NoteMusicDTO | null>(null);
	const [audience, setAudience] = useState<StoryAudience>("contacts");
	const [isChoosingAudience, setIsChoosingAudience] = useState(false);
	const [isEditingLists, setIsEditingLists] = useState(false);
	const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
	const [isPosting, setIsPosting] = useState(false);
	const [error, setError] = useState("");
	const canShare = (text.trim().length > 0 || music !== null) && !isPosting;
	const audienceLabel = STORY_AUDIENCE_OPTIONS.find((option) => option.value === audience)?.label ?? "";

	async function share() {
		if (!canShare) return;
		setIsPosting(true);
		setError("");
		try {
			onPosted(await api.createNote(text.trim(), music?.trackId ?? null, audience));
			onClose();
		} catch (postError) {
			setError(getErrorMessage(postError, "The note could not be shared. Try again."));
			setIsPosting(false);
		}
	}

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
				aria-label="New note"
				tabIndex={-1}
				className="dialog-enter flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-panel bg-paper-raised shadow-modal outline-none sm:max-w-sm sm:rounded-panel"
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-rule px-3 py-2.5">
					<Button variant="ghost" aria-label="Close new note" onClick={onClose} className="size-9 p-0">
						<X className="size-5" />
					</Button>
					<h2 className="flex-1 text-center text-base font-semibold">New note</h2>
					<Button onClick={() => void share()} disabled={!canShare} className="h-9 rounded-full px-4">
						{isPosting ? "Sharing…" : "Share"}
					</Button>
				</div>

				<div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto px-5 pt-8 pb-5">
					<NoteThoughtBubble size="lg" className="w-full max-w-[260px]">
						<textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							maxLength={NOTE_TEXT_MAX_LENGTH}
							rows={2}
							placeholder="Share a thought…"
							aria-label="Note text"
							autoFocus
							className="font-content block w-full resize-none bg-transparent text-center text-base font-medium text-ink outline-none wrap-anywhere placeholder:font-normal placeholder:text-ink-faint"
						/>
						{music && (
							<div className="mt-2 flex justify-center">
								<NoteMusicBadge track={music} onRemove={() => setMusic(null)} />
							</div>
						)}
					</NoteThoughtBubble>
					<span className="meta -mt-2 self-center text-ink-faint" aria-live="polite">
						{text.length}/{NOTE_TEXT_MAX_LENGTH}
					</span>

					<Avatar user={currentUser} size="lg" />

					<div className="flex flex-wrap justify-center gap-2">
						<Button
							variant="outline"
							onClick={() => setIsMusicPickerOpen(true)}
							className="h-8 rounded-full px-3 text-xs"
						>
							<Music aria-hidden="true" className="size-3.5" />
							{music ? "Change song" : "Add a song"}
						</Button>
						<Button
							variant="outline"
							onClick={() => setIsChoosingAudience((current) => !current)}
							aria-expanded={isChoosingAudience}
							className="h-8 rounded-full px-3 text-xs"
						>
							<Users aria-hidden="true" className="size-3.5" />
							{audienceLabel}
						</Button>
					</div>

					{isChoosingAudience && (
						<div className="flex w-full flex-col gap-2 rounded-2xl bg-paper-sunken/60 p-3">
							<div className="flex items-center justify-between">
								<span id="note-audience-label" className="text-xs font-medium text-ink-soft">
									Share with
								</span>
								<Button
									variant="ghost"
									onClick={() => setIsEditingLists(true)}
									className="h-auto p-0 text-xs text-ink-soft hover:bg-transparent hover:text-ink"
								>
									Edit lists
								</Button>
							</div>
							<SegmentedControl
								options={STORY_AUDIENCE_OPTIONS}
								value={audience}
								onChange={setAudience}
								labelledBy="note-audience-label"
							/>
						</div>
					)}

					<p className="note text-center text-ink-faint">
						Shared for {NOTE_LIFETIME_HOURS} hours.{hasNote && " It replaces your current note."}
					</p>
					{error && (
						<p role="alert" className="note text-center text-signal">
							{error}
						</p>
					)}
				</div>
			</div>

			{isEditingLists && <StoryAudienceDialog onClose={() => setIsEditingLists(false)} />}
			{isMusicPickerOpen && (
				<NoteMusicPicker
					currentTrackId={music?.trackId ?? null}
					onSelect={setMusic}
					onClose={() => setIsMusicPickerOpen(false)}
				/>
			)}
		</div>
	);
}
