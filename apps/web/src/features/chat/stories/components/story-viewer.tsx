import type { StoryDTO } from "@chatty/shared-types";
import { Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { useConcealedWhenAway } from "../../thread/hooks/use-concealed-when-away";
import { formatRelativeTime } from "../../utils/relative-time";
import { STORY_DURATION_MS, STORY_HOLD_THRESHOLD_MS } from "../constants/stories";
import { usePrefetchNextStory } from "../hooks/use-prefetch-next-story";
import type { StoryGroup, StoryPosition } from "../types/story-viewer";
import { nextStoryPosition, previousStoryPosition } from "../utils/advance-story";
import { StoryFrame } from "./story-frame";
import { StoryOwnerBar } from "./story-owner-bar";
import { StoryProgress } from "./story-progress";
import { StoryReplyBar } from "./story-reply-bar";
import { StoryViewersSheet } from "./story-viewers-sheet";

interface StoryViewerProps {
	groups: StoryGroup[];
	start: StoryPosition;
	currentUserId: string;
	onViewed: (story: StoryDTO) => void;
	onOwnChanged: (story: StoryDTO) => void;
	onOwnDeleted: (storyId: string) => void;
	onClose: () => void;
}

/**
 * Plays the row: one person's stories, then the next person's, then it closes.
 *
 * Holding anywhere pauses, as does typing a reply, the viewers list, or the
 * window losing focus — a story never runs out while nobody can see it.
 * Left third goes back, the rest goes forward; the arrow keys do the same.
 */
export function StoryViewer({
	groups,
	start,
	currentUserId,
	onViewed,
	onOwnChanged,
	onOwnDeleted,
	onClose,
}: StoryViewerProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [position, setPosition] = useState(start);
	const [isHeld, setIsHeld] = useState(false);
	const [isReplying, setIsReplying] = useState(false);
	const [isViewersOpen, setIsViewersOpen] = useState(false);
	const isAway = useConcealedWhenAway();
	// A long press pauses; releasing it must not also count as a tap that advances.
	const pressedAtRef = useRef(0);
	const isTap = () => Date.now() - pressedAtRef.current < STORY_HOLD_THRESHOLD_MS;
	const group = groups[position.groupIndex];
	const story = group?.stories[position.storyIndex];
	const isMine = story?.author.id === currentUserId;
	const [isMuted, setIsMuted] = useState(false);
	const [isBuffering, setIsBuffering] = useState(false);
	const isPaused = isHeld || isReplying || isViewersOpen || isAway;
	const nextPosition = nextStoryPosition(groups, position);
	usePrefetchNextStory(nextPosition ? groups[nextPosition.groupIndex]?.stories[nextPosition.storyIndex] : undefined);
	const onAutoplayMuted = useCallback(() => setIsMuted(true), []);

	const goNext = useCallback(() => {
		const next = nextStoryPosition(groups, position);
		if (next) setPosition(next);
		else onClose();
	}, [groups, position, onClose]);
	const goPrevious = useCallback(() => {
		const previous = previousStoryPosition(groups, position);
		if (previous) setPosition(previous);
	}, [groups, position]);

	useEffect(() => {
		if (story && !isMine) onViewed(story);
		setIsViewersOpen(false);
		setIsBuffering(false);
	}, [story?.id]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (isReplying) return;
			if (event.key === "ArrowRight") goNext();
			if (event.key === "ArrowLeft") goPrevious();
		}
		document.addEventListener("keydown", onKey);

		return () => document.removeEventListener("keydown", onKey);
	}, [goNext, goPrevious, isReplying]);

	// A story removed from under the viewer (deleted, expired) moves it on.
	useEffect(() => {
		if (!story) onClose();
	}, [story, onClose]);
	if (!group || !story) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={`Stories from ${story.author.displayName}`}
				tabIndex={-1}
				className="relative h-full w-full overflow-hidden outline-none sm:h-[min(860px,calc(100%-32px))] sm:max-w-[420px] sm:rounded-panel sm:ring-1 sm:ring-on-media/10"
			>
				<StoryFrame
					story={story}
					isPaused={isPaused}
					isMuted={isMuted}
					onBufferingChange={setIsBuffering}
					onAutoplayMuted={onAutoplayMuted}
				/>

				<div className="absolute inset-x-0 top-0 flex flex-col gap-3 bg-gradient-to-b from-scrim/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
					<StoryProgress
						count={group.stories.length}
						activeIndex={position.storyIndex}
						isPaused={isPaused || isBuffering}
						durationMs={story.media?.durationMs ?? STORY_DURATION_MS}
						onComplete={goNext}
					/>
					<div className="flex items-center gap-2.5 text-on-media">
						<Avatar user={story.author} size="sm" />
						<span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
							{isMine ? "Your story" : story.author.displayName}
							<span className="meta ml-2 font-normal text-on-media/75">
								{formatRelativeTime(story.createdAt)}
							</span>
						</span>
						{story.kind === "video" && (
							<Button
								variant="ghost"
								onClick={() => setIsMuted((current) => !current)}
								aria-label={isMuted ? "Unmute" : "Mute"}
								className="size-8 p-0 text-on-media hover:bg-on-media/15 hover:text-on-media"
							>
								{isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
							</Button>
						)}
						<Button
							variant="ghost"
							onClick={onClose}
							aria-label="Close stories"
							className="size-8 p-0 text-on-media hover:bg-on-media/15 hover:text-on-media"
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>

				{/* Tap zones sit under the top and bottom bars, so their buttons stay reachable. */}
				<div
					className="absolute inset-x-0 top-20 bottom-36 flex"
					onPointerDown={() => {
						pressedAtRef.current = Date.now();
						setIsHeld(true);
					}}
					onPointerUp={() => setIsHeld(false)}
					onPointerLeave={() => setIsHeld(false)}
					onPointerCancel={() => setIsHeld(false)}
				>
					<Button
						variant="ghost"
						aria-label="Previous story"
						onClick={(event) => {
							if (event.detail === 0 || isTap()) goPrevious();
						}}
						className="h-full w-1/3 rounded-none p-0 hover:bg-transparent focus-visible:bg-on-media/10"
					>
						<span className="sr-only">Previous story</span>
					</Button>
					<Button
						variant="ghost"
						aria-label="Next story"
						onClick={(event) => {
							if (event.detail === 0 || isTap()) goNext();
						}}
						className="h-full flex-1 rounded-none p-0 hover:bg-transparent focus-visible:bg-on-media/10"
					>
						<span className="sr-only">Next story</span>
					</Button>
				</div>

				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/80 to-transparent px-3 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
					{isMine ? (
						<StoryOwnerBar
							story={story}
							onShowViewers={() => setIsViewersOpen(true)}
							onChanged={onOwnChanged}
							onDeleted={(storyId) => {
								// The list shrinks under the same index, so the next story slides
								// into place; deleting the last one ends the viewer.
								const isLast = position.storyIndex === group.stories.length - 1;
								onOwnDeleted(storyId);
								if (isLast) onClose();
							}}
						/>
					) : (
						<StoryReplyBar key={story.id} story={story} onFocusChange={setIsReplying} />
					)}
				</div>

				{isViewersOpen && <StoryViewersSheet storyId={story.id} onClose={() => setIsViewersOpen(false)} />}
			</div>
		</div>
	);
}
