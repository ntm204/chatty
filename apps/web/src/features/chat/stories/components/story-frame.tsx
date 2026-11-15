import type { StoryDTO } from "@chatty/shared-types";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { CONVERSATION_THEME_CLASSES } from "../../constants/conversation-theme";

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
 * soft scrim, or words centred on their colour. Media is never cropped — a
 * story cut to fill the frame loses whatever the author framed it around.
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
						// No controls: the story's own clock, tap zones and pause are the controls.
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
	const theme = CONVERSATION_THEME_CLASSES[story.background ?? "iris"];

	return (
		<div className={cn("flex h-full w-full items-center justify-center px-8", theme.bubble)}>
			<p
				className={cn(
					"font-content max-w-md text-center text-[26px]/[1.35] font-semibold whitespace-pre-wrap wrap-anywhere",
					theme.bubbleInk,
				)}
			>
				{story.text}
			</p>
		</div>
	);
}
