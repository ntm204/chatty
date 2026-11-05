import { X } from "lucide-react";
import { Button } from "@/components/button";

interface ComposerAttachmentsProps {
	/** Object URLs, one per picked file, in the order they will be sent. */
	previewUrls: string[];
	onRemove: (index: number) => void;
}

/**
 * The strip of thumbnails under the composer, before anything is sent.
 *
 * Split out of `MessageInput` when that file went over the 300-line limit, and
 * it is a real seam: the composer owns the files, and this owns nothing — it is
 * handed URLs and reports which one was dismissed.
 *
 * It scrolls sideways rather than wrapping. Ten thumbnails stacked three rows
 * deep push the field somebody is typing in off the bottom of a short window,
 * which is the one thing the composer must never do.
 */
export function ComposerAttachments({ previewUrls, onRemove }: ComposerAttachmentsProps) {
	return (
		<div className="composer-attachments flex gap-2 overflow-x-auto px-4 pb-1 pt-4">
			{previewUrls.map((previewUrl, index) => (
				// Keyed by the URL: object URLs are unique per file, and the index
				// would re-key every thumbnail after the one that was removed.
				<div key={`${previewUrl}-${index}`} className="relative shrink-0 pt-1">
					<img
						src={previewUrl}
						alt={`Attached image preview ${index + 1}`}
						className="size-20 rounded-control border border-rule object-cover"
					/>
					<Button
						variant="ghost"
						onClick={() => onRemove(index)}
						aria-label={`Remove attached image ${index + 1}`}
						className="absolute -right-2 top-0 size-5 rounded-badge border border-rule bg-paper-raised p-0 text-ink-soft"
					>
						<X className="size-3" />
					</Button>
				</div>
			))}
		</div>
	);
}
