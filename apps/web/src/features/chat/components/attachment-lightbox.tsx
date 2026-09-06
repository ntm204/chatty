import type { AttachmentDTO } from "@chatty/shared-types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/hooks/use-dialog";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { LIGHTBOX_CONTROL_CLASS } from "../constants/attachment";
import { useAttachmentZoom } from "../hooks/use-attachment-zoom";
import { downloadAttachment } from "../utils";
import { AttachmentLightboxThumbnails } from "./attachment-lightbox-thumbnails";
import { AttachmentLightboxToolbar } from "./attachment-lightbox-toolbar";

interface AttachmentLightboxProps {
	attachments: AttachmentDTO[];
	/** Which one was clicked. The viewer opens here and moves from it. */
	initialIndex: number;
	/** The message text, stated in full above the picture — never over it. */
	caption: string;
	onClose: () => void;
	onOpenMessage?: (attachment: AttachmentDTO) => void;
	/**
	 * Forwards the message these pictures came with. Absent where the viewer was
	 * opened from something that is not a message — the vault lists attachments,
	 * not the messages that carried them.
	 */
	onForward?: () => void;
}

/**
 * A picture, full screen, with everything it needs and nothing else.
 *
 * **There is no panel.** The viewer used to draw a bordered card on the scrim,
 * a rule under its header, a rule over its thumbnails and a border around each
 * of its six controls — nine lines of chrome around one photograph, which is
 * the opposite of what a viewer is for. What is left is the picture, the words
 * that came with it, the set it belongs to, and controls that appear only under
 * the pointer. The viewer's controls now meet again in one compact dock below
 * the image, rather than sending the reader to a different screen corner for
 * every action.
 *
 * Previous/next live on a centred, fixed-width navigation rail. An image's
 * aspect ratio must not decide where the next-picture target lands: portrait
 * and landscape both put it in the same place, and it only fades in on intent.
 *
 * **The caption is above the picture, centred, not layered over it.** Laying it
 * across the top of the image hid part of every photograph whose subject was at
 * the top — which is most of them — and a translucent wash over a picture is
 * unreadable exactly when the picture is busy. Above it, it is type on a scrim:
 * always legible, and it costs the image only the height of the words.
 *
 * **The picture itself is not just looked at, it is examined.** A wheel or a
 * trackpad pinch zooms in on the point under the cursor, a double-click or
 * double-tap jumps to a close look and back, dragging pans once zoomed, and a
 * turned photograph rotates in place — all in `useAttachmentZoom`, which also
 * resets every one of them the moment the picture underneath changes.
 *
 * Escape closes; the arrow keys walk the set and wrap at both ends; `+`/`-`
 * zoom, `0` resets it, `R` rotates clockwise and `Shift+R` rotates back.
 */
export function AttachmentLightbox({
	attachments,
	initialIndex,
	caption,
	onClose,
	onOpenMessage,
	onForward,
}: AttachmentLightboxProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [index, setIndex] = useState(initialIndex);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	const total = attachments.length;
	const current = attachments[index];

	const step = useCallback((delta: number) => setIndex((value) => (value + delta + total) % total), [total]);

	const {
		imageAreaRef,
		imageRef,
		zoom,
		rotation,
		fitScale,
		pan,
		isDragging,
		zoomIn,
		zoomOut,
		resetZoom,
		rotate,
		handleImageLoad,
		handleDoubleClick,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
	} = useAttachmentZoom(current?.id ?? "");

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "ArrowRight") step(1);
			if (event.key === "ArrowLeft") step(-1);
			if (event.key === "+" || event.key === "=") zoomIn();
			if (event.key === "-" || event.key === "_") zoomOut();
			if (event.key === "0") resetZoom();
			if (event.key.toLowerCase() === "r") rotate(event.shiftKey ? -1 : 1);
		}

		window.addEventListener("keydown", handleKeyDown);

		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [resetZoom, rotate, step, zoomIn, zoomOut]);

	// Both neighbours are fetched while this one is being looked at, so an arrow
	// key swaps the picture instead of blanking the frame for as long as a
	// megabyte takes to arrive. Nothing is kept: the point is only to put the
	// bytes in the browser's cache before they are asked for.
	useEffect(() => {
		if (total < 2) return;

		for (const offset of [1, -1]) {
			const neighbour = attachments[(index + offset + total) % total];
			if (neighbour) new Image().src = neighbour.url;
		}
	}, [attachments, index, total]);

	if (!current) return null;

	async function saveCurrentImage(attachment: AttachmentDTO): Promise<void> {
		setIsSaving(true);
		setSaveError("");
		try {
			await downloadAttachment(attachment);
		} catch {
			setSaveError("This image could not be saved");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div
			ref={dialogRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			aria-label={total > 1 ? `Image ${index + 1} of ${total}` : "Image preview"}
			onClick={close}
			className="fixed inset-0 z-50 flex flex-col gap-3 bg-scrim/90 p-3 dark:bg-scrim/95 sm:p-5"
		>
			{caption && (
				<div
					onClick={(event) => event.stopPropagation()}
					className="mx-auto flex w-full max-w-2xl shrink-0 flex-col items-center gap-1 px-2 text-center"
				>
					<p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-center text-sm/[1.55] text-on-media/85">
						{caption}
					</p>
				</div>
			)}

			{saveError && (
				<p role="alert" className="meta mx-auto w-max shrink-0 rounded-badge bg-signal px-2 py-1 text-on-media">
					{saveError}
				</p>
			)}

			<div
				className={cn(
					"group grid min-h-0 flex-1 items-stretch",
					total > 1
						? "grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] gap-1 sm:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] sm:gap-2"
						: "grid-cols-1",
				)}
			>
				{total > 1 && (
					<div className="flex items-center justify-center" data-lightbox-navigation-rail="previous">
						<Button
							variant="ghost"
							onClick={(event) => {
								event.stopPropagation();
								step(-1);
							}}
							aria-label="Previous image"
							className={cn(LIGHTBOX_CONTROL_CLASS, "size-9 bg-on-media/8 hover:bg-on-media/16")}
						>
							<ChevronLeft className="size-5" />
						</Button>
					</div>
				)}

				<div
					ref={imageAreaRef}
					data-lightbox-image-area
					className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden"
				>
					{/* The entrance animation lives on this wrapper rather than on the
					    image itself, because the image already owns `transform` for
					    zoom, pan and rotation — one element animating one CSS property
					    from two places at once is how a transition starts fighting a
					    drag instead of yielding to it. */}
					<div className="flex max-h-full max-w-full items-center justify-center">
						<div key={current.id} className="flex max-h-full max-w-full items-center justify-center">
							<img
								ref={imageRef}
								src={current.url}
								alt={caption || "Image"}
								draggable={false}
								onLoad={handleImageLoad}
								onClick={(event) => event.stopPropagation()}
								onDoubleClick={handleDoubleClick}
								onPointerDown={handlePointerDown}
								onPointerMove={handlePointerMove}
								onPointerUp={handlePointerUp}
								onPointerCancel={handlePointerUp}
								style={{
									transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom * fitScale})`,
								}}
								className={cn(
									"max-h-full max-w-full touch-none select-none rounded-control object-contain",
									!isDragging && "transition-transform duration-200 ease-out",
									zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
								)}
							/>
						</div>
					</div>
				</div>

				{total > 1 && (
					<div className="flex items-center justify-center" data-lightbox-navigation-rail="next">
						<Button
							variant="ghost"
							onClick={(event) => {
								event.stopPropagation();
								step(1);
							}}
							aria-label="Next image"
							className={cn(LIGHTBOX_CONTROL_CLASS, "size-9 bg-on-media/8 hover:bg-on-media/16")}
						>
							<ChevronRight className="size-5" />
						</Button>
					</div>
				)}
			</div>

			<div className="flex shrink-0 flex-col items-center gap-2">
				<AttachmentLightboxToolbar
					zoom={zoom}
					onZoomIn={zoomIn}
					onZoomOut={zoomOut}
					onResetZoom={resetZoom}
					onRotateCounterclockwise={() => rotate(-1)}
					onRotateClockwise={() => rotate(1)}
					onSave={() => void saveCurrentImage(current)}
					isSaving={isSaving}
					onClose={close}
					{...(onOpenMessage ? { onOpenMessage: () => onOpenMessage(current) } : {})}
					{...(onForward ? { onForward } : {})}
				/>

				{total > 1 && (
					<AttachmentLightboxThumbnails attachments={attachments} activeIndex={index} onSelect={setIndex} />
				)}
			</div>
		</div>
	);
}
