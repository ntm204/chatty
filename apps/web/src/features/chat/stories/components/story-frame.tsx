import type { StoryDTO } from "@chatty/shared-types";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/avatar";
import { detectNoteEasterEgg } from "../utils/detect-note-easter-egg";
import { NoteEasterEggParticles } from "./note-easter-egg-particles";
import { NoteBubble } from "./note-bubble";
import { NoteMusicBadge } from "./note-music-badge";

interface StoryFrameProps {
	story: StoryDTO;
	/** Pauses a video in step with the story's clock. */
	isPaused: boolean;
	isMuted: boolean;
	/** A video waiting for data holds the story's clock, so it never advances past a frozen frame. */
	onBufferingChange: (isBuffering: boolean) => void;
	/** Browsers refuse sound before a gesture; the frame falls back to muted and says so. */
	onAutoplayMuted: () => void;
}

/**
 * What a story shows: a photo or video, fitted whole with its caption over a
 * soft scrim, or a note: its words in a message bubble above the author's face.
 */
export function StoryFrame({ story, isPaused, isMuted, onBufferingChange, onAutoplayMuted }: StoryFrameProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const blockSave = story.isSaveAllowed
		? undefined
		: (event: { preventDefault: () => void }) => event.preventDefault();

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (isPaused) {
			video.pause();

			return;
		}
		video.play().catch(() => {
			if (!video.muted) {
				video.muted = true;
				onAutoplayMuted();
				void video.play().catch(() => undefined);
			}
		});
	}, [isPaused, story.id, onAutoplayMuted]);

	if (story.media) {
		return (
			<div className="relative flex h-full w-full items-center justify-center bg-scrim">
				{story.kind === "video" ? (
					<video
						ref={videoRef}
						key={story.id}
						src={story.media.url}
						poster={story.media.posterUrl ?? undefined}
						playsInline
						muted={isMuted}
						preload="auto"
						aria-label={story.text || `Video story from ${story.author.displayName}`}
						onWaiting={() => onBufferingChange(true)}
						onPlaying={() => onBufferingChange(false)}
						onContextMenu={blockSave}
						controlsList="nodownload noplaybackrate"
						disablePictureInPicture
						className="max-h-full max-w-full object-contain"
					/>
				) : (
					<img
						src={story.media.url}
						alt={story.text || `Story from ${story.author.displayName}`}
						draggable={story.isSaveAllowed}
						onContextMenu={blockSave}
						className="max-h-full max-w-full object-contain"
					/>
				)}
				{story.text && (
					<p className="font-content absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/80 to-transparent px-5 pt-10 pb-24 text-center text-[15px]/[1.5] text-on-media">
						{story.text}
					</p>
				)}
			</div>
		);
	}

	const thought = story.text;
	const easterEgg = thought ? detectNoteEasterEgg(thought) : null;

	return (
		<div className="flex h-full w-full flex-col items-center justify-center px-6">
			<div className="flex flex-col items-center gap-3">
				<NoteBubble isMine={false} size="lg" className="relative max-w-xs">
					{easterEgg && <NoteEasterEggParticles type={easterEgg.type} />}
					{easterEgg && (
						<p className="mb-2 text-center text-xs text-ink-soft">
							{easterEgg.emoji} {easterEgg.label}
						</p>
					)}
					{thought && (
						<p className="font-content text-center text-lg/[1.45] font-medium whitespace-pre-wrap wrap-anywhere">
							{thought}
						</p>
					)}
					{story.music && (
						<div className={thought ? "mt-3 flex justify-center" : "flex justify-center"}>
							<NoteMusicBadge track={story.music} isAutoPlaying={!isPaused && !isMuted} />
						</div>
					)}
				</NoteBubble>

				<div className="flex flex-col items-center gap-1">
					<Avatar user={story.author} size="lg" />
					<span className="text-sm font-semibold text-on-media drop-shadow-xs">
						{story.author.displayName}
					</span>
				</div>
			</div>
		</div>
	);
}
