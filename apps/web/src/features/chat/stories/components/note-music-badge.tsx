import type { NoteMusicDTO } from "@chatty/shared-types";
import { Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { playNotePreview, stopNotePreview } from "../utils/note-audio";

interface NoteMusicBadgeProps {
	track: NoteMusicDTO;
	/** The viewer plays the song while the note is on screen and stops it when paused or muted. */
	isAutoPlaying?: boolean;
	onRemove?: () => void;
	className?: string;
}

/** The song on a note: cover, title and artist, and one button to hear its 30-second preview. */
export function NoteMusicBadge({ track, isAutoPlaying, onRemove, className }: NoteMusicBadgeProps) {
	const [isPlaying, setIsPlaying] = useState(false);

	useEffect(() => {
		if (isAutoPlaying === undefined) return;
		if (isAutoPlaying) {
			setIsPlaying(true);
			playNotePreview(track.previewUrl, () => setIsPlaying(false));
		} else {
			stopNotePreview();
		}
	}, [isAutoPlaying, track.previewUrl]);

	// Leaving the screen ends the song: a preview must never outlive the note it belongs to.
	useEffect(() => () => stopNotePreview(), [track.previewUrl]);

	function togglePlayback() {
		if (isPlaying) {
			stopNotePreview();

			return;
		}
		setIsPlaying(true);
		playNotePreview(track.previewUrl, () => setIsPlaying(false));
	}

	return (
		<div
			className={cn(
				"inline-flex max-w-full items-center gap-2 rounded-full bg-paper-raised/70 py-1 pr-1 pl-1 text-xs text-ink",
				className,
			)}
		>
			<img src={track.artworkUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
			<span className="min-w-0 truncate text-left">
				<span className="font-medium">{track.title}</span>
				<span className="text-ink-soft"> · {track.artist}</span>
			</span>
			<Button
				variant="ghost"
				onClick={togglePlayback}
				aria-label={isPlaying ? "Stop song preview" : "Play song preview"}
				className="size-6 shrink-0 rounded-full p-0"
			>
				{isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
			</Button>
			{onRemove && (
				<Button
					variant="ghost"
					onClick={onRemove}
					aria-label="Remove song"
					className="size-6 shrink-0 rounded-full p-0 text-ink-soft"
				>
					<X className="size-3.5" />
				</Button>
			)}
		</div>
	);
}
