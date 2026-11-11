import type { AttachmentDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { LIGHTBOX_THUMBNAIL_CLASS } from "../../constants/attachment";
import { getAttachmentPreviewUrl } from "../utils/attachment-display";

interface AttachmentLightboxThumbnailsProps {
	attachments: AttachmentDTO[];
	activeIndex: number;
	onSelect: (index: number) => void;
}

/**
 * The rest of the set, under the picture.
 *
 * **Centred, and not with `justify-center`.** A centred flex row that overflows
 * its scroller loses its first items off the left edge with no way to scroll
 * back to them — and a set large enough to overflow is exactly when the strip
 * earns its place. An inner `w-max` row centred by `mx-auto` sits in the middle
 * while it fits and scrolls from its true start once it does not.
 *
 * The one that is open is stated by opacity and a ring rather than by a border:
 * a border on the active thumbnail and none on the others changes each tile's
 * size as the reader moves through the set.
 */
export function AttachmentLightboxThumbnails({
	attachments,
	activeIndex,
	onSelect,
}: AttachmentLightboxThumbnailsProps) {
	return (
		<div onClick={(event) => event.stopPropagation()} className="max-w-full shrink-0 overflow-x-auto">
			<div role="group" aria-label="Image thumbnails" className="mx-auto flex w-max gap-2 p-1">
				{attachments.map((attachment, index) => (
					<Button
						key={attachment.id}
						variant="ghost"
						onClick={() => onSelect(index)}
						aria-label={`View image ${index + 1} of ${attachments.length}`}
						aria-pressed={index === activeIndex}
						className={cn(
							"shrink-0 overflow-hidden rounded-control p-0 transition duration-200 ease-out",
							"focus-visible:ring-on-media/40",
							LIGHTBOX_THUMBNAIL_CLASS,
							index === activeIndex ? "ring-2 ring-on-media" : "opacity-45 hover:opacity-90",
						)}
					>
						<img
							src={getAttachmentPreviewUrl(attachment)}
							alt=""
							loading="lazy"
							className="size-full object-cover"
						/>
					</Button>
				))}
			</div>
		</div>
	);
}
