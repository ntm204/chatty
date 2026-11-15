import { Clapperboard, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";

interface StoryMediaPickerProps {
	kind: "photo" | "video";
	file: File | null;
	onChange: (file: File | null) => void;
}

/** Picks the photo or video for a story and shows it in the story's own 9:16 frame. */
export function StoryMediaPicker({ kind, file, onChange }: StoryMediaPickerProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setPreviewUrl(null);

			return;
		}
		const url = URL.createObjectURL(file);
		setPreviewUrl(url);

		return () => URL.revokeObjectURL(url);
	}, [file]);

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept={kind === "video" ? "video/*" : "image/*"}
				className="hidden"
				aria-label={kind === "video" ? "Story video" : "Story photo"}
				onChange={(event) => onChange(event.target.files?.[0] ?? null)}
			/>
			<Button
				variant="ghost"
				onClick={() => inputRef.current?.click()}
				className="flex aspect-[9/16] max-h-80 w-full items-center justify-center overflow-hidden rounded-panel border border-dashed border-rule bg-paper-sunken p-0"
			>
				{previewUrl && kind === "video" ? (
					<video
						src={previewUrl}
						muted
						playsInline
						autoPlay
						loop
						aria-label="Selected video"
						className="h-full w-full object-contain"
					/>
				) : previewUrl ? (
					<img src={previewUrl} alt="Selected photo" className="h-full w-full object-contain" />
				) : (
					<span className="flex flex-col items-center gap-2 text-ink-faint">
						{kind === "video" ? <Clapperboard className="size-6" /> : <ImagePlus className="size-6" />}
						<span className="text-[13px]">
							{kind === "video" ? "Choose a video · up to 15s" : "Choose a photo"}
						</span>
					</span>
				)}
			</Button>
		</>
	);
}
