import type { NoteMusicDTO } from "@chatty/shared-types";
import { Check, Pause, Play, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { useNoteMusicSearch } from "../hooks/use-note-music-search";
import { playNotePreview, stopNotePreview } from "../utils/note-audio";

interface NoteMusicPickerProps {
	currentTrackId: string | null;
	onSelect: (track: NoteMusicDTO) => void;
	onClose: () => void;
}

/**
 * Choosing a song for a note: search Apple's catalogue (ADR 0026), or pick from
 * what is popular in Vietnam. Each row plays its 30-second preview; choosing
 * one closes the picker.
 */
export function NoteMusicPicker({ currentTrackId, onSelect, onClose }: NoteMusicPickerProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [query, setQuery] = useState("");
	const [previewingId, setPreviewingId] = useState<string | null>(null);
	const { tracks, isLoading, error } = useNoteMusicSearch(query);

	useEffect(() => () => stopNotePreview(), []);

	function togglePreview(track: NoteMusicDTO) {
		if (previewingId === track.trackId) {
			stopNotePreview();

			return;
		}
		setPreviewingId(track.trackId);
		playNotePreview(track.previewUrl, () =>
			setPreviewingId((current) => (current === track.trackId ? null : current)),
		);
	}

	function choose(track: NoteMusicDTO) {
		stopNotePreview();
		onSelect(track);
		onClose();
	}

	return (
		<div
			className="backdrop-fade fixed inset-0 z-60 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Add a song"
				tabIndex={-1}
				className="dialog-enter flex h-[min(560px,85vh)] w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-rule p-3">
					<input
						type="search"
						aria-label="Search songs"
						placeholder="Search songs or artists"
						maxLength={100}
						value={query}
						autoFocus
						onChange={(event) => setQuery(event.target.value)}
						className="min-w-0 flex-1 rounded-control border border-rule bg-paper px-3 py-2 text-sm"
					/>
					<Button variant="ghost" aria-label="Close song picker" onClick={onClose} className="size-9 p-0">
						<X className="size-4" />
					</Button>
				</div>

				<p className="meta shrink-0 px-4 pt-3 pb-1 text-ink-soft">
					{query.trim() ? "Results" : "Popular in Vietnam"}
				</p>
				<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-busy={isLoading}>
					{error ? (
						<p role="alert" className="p-3 text-sm text-signal">
							{error}
						</p>
					) : !isLoading && tracks.length === 0 ? (
						<p className="p-3 text-sm text-ink-soft">No songs found.</p>
					) : (
						<ul className={cn("flex flex-col", isLoading && "opacity-60")}>
							{tracks.map((track) => {
								const isPreviewing = previewingId === track.trackId;
								const isChosen = currentTrackId === track.trackId;

								return (
									<li key={track.trackId} className="flex items-center gap-1">
										<Button
											variant="ghost"
											onClick={() => choose(track)}
											aria-label={`${track.title} by ${track.artist}`}
											className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-control px-2 py-1.5 text-left font-normal"
										>
											<img
												src={track.artworkUrl}
												alt=""
												loading="lazy"
												className="size-10 shrink-0 rounded-md object-cover"
											/>
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate text-sm font-medium text-ink">
													{track.title}
												</span>
												<span className="truncate text-xs text-ink-soft">{track.artist}</span>
											</span>
											{isChosen && (
												<Check aria-hidden="true" className="size-4 shrink-0 text-ink" />
											)}
										</Button>
										<Button
											variant="ghost"
											onClick={() => togglePreview(track)}
											aria-label={`${isPreviewing ? "Stop" : "Play"} preview of ${track.title}`}
											className="size-9 shrink-0 rounded-full p-0"
										>
											{isPreviewing ? <Pause className="size-4" /> : <Play className="size-4" />}
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
