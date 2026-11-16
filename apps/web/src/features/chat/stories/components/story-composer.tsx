import {
	STORY_TEXT_MAX_LENGTH,
	type CurrentUserDTO,
	type NoteMusicDTO,
	type StoryAudience,
	type StoryDTO,
	type StoryDurationHours,
} from "@chatty/shared-types";
import { Music, X } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { useAuth } from "@/hooks/use-auth";
import { useDialog } from "@/hooks/use-dialog";
import { getErrorMessage } from "@/utils/get-error-message";
import { STORY_AUDIENCE_OPTIONS } from "../constants/stories";
import { STORY_DURATION_OPTIONS } from "../constants/story-composer";
import { detectNoteEasterEgg } from "../utils/detect-note-easter-egg";
import { NoteBubble } from "./note-bubble";
import { NoteEasterEggParticles } from "./note-easter-egg-particles";
import { NoteMusicBadge } from "./note-music-badge";
import { NoteMusicPicker } from "./note-music-picker";
import { StoryAudienceDialog } from "./story-audience-dialog";

interface StoryComposerProps {
	currentUser?: CurrentUserDTO;
	onPosted: (story: StoryDTO) => void;
	onClose: () => void;
}

/**
 * Posting a note: words written straight into the bubble they will appear in,
 * a song if you like, then who sees it and for how long.
 */
export function StoryComposer({ currentUser: propUser, onPosted, onClose }: StoryComposerProps) {
	const authUser = useAuth((state) => state.currentUser);
	const user = propUser ?? authUser;
	const close = useCallback(() => onClose(), [onClose]);
	// Escape belongs to the song picker while it is open, so this dialog does not take it.
	const dialogRef = useDialog<HTMLDivElement>(close, { closeOnEscape: false });
	const [durationHours, setDurationHours] = useState<StoryDurationHours>(24);
	const [text, setText] = useState("");
	const [music, setMusic] = useState<NoteMusicDTO | null>(null);
	const [audience, setAudience] = useState<StoryAudience>("contacts");
	const [isAudienceOpen, setIsAudienceOpen] = useState(false);
	const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
	const [isPosting, setIsPosting] = useState(false);
	const [error, setError] = useState("");

	const canPost = text.trim().length > 0 || music !== null;
	const easterEgg = detectNoteEasterEgg(text);

	async function post() {
		if (!canPost || isPosting) return;
		setIsPosting(true);
		setError("");
		try {
			onPosted(await api.createNote(text.trim(), music?.trackId ?? null, audience, durationHours));
			onClose();
		} catch (postError) {
			setError(getErrorMessage(postError, "The note could not be shared. Try again."));
		} finally {
			setIsPosting(false);
		}
	}

	return (
		<div
			className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
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
				className="dialog-enter flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">New note</h2>
					<Button
						variant="ghost"
						aria-label="Close new note"
						onClick={onClose}
						className="absolute top-3 right-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
					<div className="flex flex-col items-center gap-3 py-1">
						<NoteBubble isMine size="lg" className="relative w-full max-w-[280px]">
							{easterEgg && <NoteEasterEggParticles type={easterEgg.type} />}
							{easterEgg && (
								<p className="mb-1.5 text-center text-xs opacity-75">
									{easterEgg.emoji} {easterEgg.label}
								</p>
							)}
							<textarea
								value={text}
								onChange={(event) => setText(event.target.value)}
								maxLength={STORY_TEXT_MAX_LENGTH}
								rows={2}
								placeholder="Share a thought…"
								aria-label="Note text"
								autoFocus
								className="font-content w-full resize-none bg-transparent text-center text-base font-medium outline-none wrap-anywhere placeholder:font-normal placeholder:text-block-ink/50"
							/>
							{music && (
								<div className="mt-2 flex justify-center">
									<NoteMusicBadge track={music} onRemove={() => setMusic(null)} />
								</div>
							)}
							<span className="meta mt-1 block text-right text-block-ink/60">
								{text.length}/{STORY_TEXT_MAX_LENGTH}
							</span>
						</NoteBubble>

						{user && <Avatar user={user} size="lg" />}

						<Button
							variant="outline"
							onClick={() => setIsMusicPickerOpen(true)}
							className="rounded-full px-3.5 py-1.5 text-xs"
						>
							<Music aria-hidden="true" className="size-3.5" />
							{music ? "Change song" : "Add a song"}
						</Button>
					</div>

					<div className="flex flex-col gap-2 rounded-2xl bg-paper-sunken/60 p-3">
						<div className="flex items-center justify-between">
							<span id="story-audience-label" className="text-xs font-medium text-ink-soft">
								Share with
							</span>
							<Button
								variant="ghost"
								onClick={() => setIsAudienceOpen(true)}
								className="h-auto p-0 text-xs text-ink-soft hover:bg-transparent hover:text-ink"
							>
								Edit lists
							</Button>
						</div>
						<SegmentedControl
							options={STORY_AUDIENCE_OPTIONS}
							value={audience}
							onChange={setAudience}
							labelledBy="story-audience-label"
						/>
						<span id="story-duration-label" className="mt-1 text-xs font-medium text-ink-soft">
							Disappears after
						</span>
						<SegmentedControl
							options={STORY_DURATION_OPTIONS}
							value={durationHours}
							onChange={setDurationHours}
							labelledBy="story-duration-label"
						/>
					</div>

					{error && (
						<p role="alert" className="note text-signal">
							{error}
						</p>
					)}
				</div>

				<div className="border-t border-rule p-4">
					<Button onClick={() => void post()} disabled={!canPost || isPosting} className="w-full">
						{isPosting ? "Sharing…" : "Share note"}
					</Button>
				</div>
			</div>

			{isAudienceOpen && <StoryAudienceDialog onClose={() => setIsAudienceOpen(false)} />}
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
