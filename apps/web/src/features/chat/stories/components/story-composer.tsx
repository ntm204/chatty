import {
	STORY_TEXT_MAX_LENGTH,
	type ConversationTheme,
	type StoryAudience,
	type StoryDTO,
	type StoryDurationHours,
	type StoryKind,
} from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/get-error-message";
import { CONVERSATION_THEME_CLASSES } from "../../constants/conversation-theme";
import { optimizeImagesForUpload } from "../../utils/optimize-image-upload";
import { STORY_AUDIENCE_OPTIONS, STORY_BACKGROUNDS } from "../constants/stories";
import { STORY_DURATION_OPTIONS, STORY_KIND_OPTIONS } from "../constants/story-composer";
import { StoryAudienceDialog } from "./story-audience-dialog";
import { StoryMediaPicker } from "./story-media-picker";

interface StoryComposerProps {
	onPosted: (story: StoryDTO) => void;
	onClose: () => void;
}

/**
 * Posting a story: a photo or a short video with an optional caption, or words
 * on a colour, shown as it will appear, for a chosen lifetime. A photo is
 * reduced in the browser before upload, like a chat photo; a video is trimmed
 * to 15 seconds and re-encoded by the server. The audience is chosen here, and the two private lists
 * behind "Close friends" and "Hidden" are a tap away.
 */
export function StoryComposer({ onPosted, onClose }: StoryComposerProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [kind, setKind] = useState<StoryKind>("photo");
	const [file, setFile] = useState<File | null>(null);
	const [durationHours, setDurationHours] = useState<StoryDurationHours>(24);
	const [text, setText] = useState("");
	const [background, setBackground] = useState<ConversationTheme>("iris");
	const [audience, setAudience] = useState<StoryAudience>("contacts");
	const [isAudienceOpen, setIsAudienceOpen] = useState(false);
	const [isPosting, setIsPosting] = useState(false);
	const [error, setError] = useState("");
	const isMedia = kind !== "text";
	const canPost = isMedia ? file !== null : text.trim().length > 0;
	const theme = CONVERSATION_THEME_CLASSES[background];

	function chooseKind(next: StoryKind) {
		setKind(next);
		// A photo picked under "Photo" is not a video under "Video".
		setFile(null);
	}

	async function post() {
		if (!canPost || isPosting) return;
		setIsPosting(true);
		setError("");
		try {
			const story =
				isMedia && file
					? await api.createMediaStory(
							kind === "video" ? "video" : "photo",
							kind === "photo" ? ((await optimizeImagesForUpload([file]))[0] ?? file) : file,
							text.trim(),
							audience,
							durationHours,
						)
					: await api.createTextStory(text.trim(), background, audience, durationHours);
			onPosted(story);
			onClose();
		} catch (postError) {
			setError(getErrorMessage(postError, "The story could not be posted. Try again."));
		} finally {
			setIsPosting(false);
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="New story"
				tabIndex={-1}
				className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">New story</h2>
					<Button
						variant="ghost"
						aria-label="Close new story"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
					<span id="story-kind-label" className="sr-only">
						Story type
					</span>
					<SegmentedControl
						options={STORY_KIND_OPTIONS}
						value={kind}
						onChange={chooseKind}
						labelledBy="story-kind-label"
					/>

					{isMedia ? (
						<StoryMediaPicker kind={kind === "video" ? "video" : "photo"} file={file} onChange={setFile} />
					) : (
						<div
							className={cn(
								"flex aspect-[9/16] max-h-80 items-center justify-center rounded-panel p-6",
								theme.bubble,
							)}
						>
							<p
								className={cn(
									"font-content text-center text-xl font-semibold whitespace-pre-wrap wrap-anywhere",
									theme.bubbleInk,
								)}
							>
								{text || "Your words"}
							</p>
						</div>
					)}

					<textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						maxLength={STORY_TEXT_MAX_LENGTH}
						rows={2}
						placeholder={isMedia ? "Add a caption" : "Write something"}
						aria-label={isMedia ? "Caption" : "Story text"}
						className="font-content min-h-16 shrink-0 resize-none rounded-control border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-ink"
					/>

					{kind === "text" && (
						<div role="radiogroup" aria-label="Background colour" className="flex flex-wrap gap-2">
							{STORY_BACKGROUNDS.map((color) => (
								<Button
									key={color}
									variant="ghost"
									role="radio"
									aria-checked={color === background}
									aria-label={color}
									onClick={() => setBackground(color)}
									className={cn(
										"size-7 rounded-full p-0",
										CONVERSATION_THEME_CLASSES[color].bubble,
										color === background &&
											"ring-2 ring-ink ring-offset-2 ring-offset-paper-raised",
									)}
								>
									<span className="sr-only">{color}</span>
								</Button>
							))}
						</div>
					)}

					<div className="flex flex-col gap-2">
						<span id="story-duration-label" className="text-[13px] font-medium text-ink">
							Disappears after
						</span>
						<SegmentedControl
							options={STORY_DURATION_OPTIONS}
							value={durationHours}
							onChange={setDurationHours}
							labelledBy="story-duration-label"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<span id="story-audience-label" className="text-[13px] font-medium text-ink">
							Who can see it
						</span>
						<SegmentedControl
							options={STORY_AUDIENCE_OPTIONS}
							value={audience}
							onChange={setAudience}
							labelledBy="story-audience-label"
						/>
						<Button
							variant="ghost"
							onClick={() => setIsAudienceOpen(true)}
							className="self-start px-0 text-[13px] text-ink-soft hover:bg-transparent hover:text-ink"
						>
							Edit close friends and hidden people
						</Button>
					</div>

					{error && (
						<p role="alert" className="note text-signal">
							{error}
						</p>
					)}
				</div>

				<div className="border-t border-rule p-4">
					<Button onClick={() => void post()} disabled={!canPost || isPosting} className="w-full">
						{isPosting ? "Posting…" : "Share story"}
					</Button>
				</div>
			</div>
			{isAudienceOpen && <StoryAudienceDialog onClose={() => setIsAudienceOpen(false)} />}
		</div>
	);
}
