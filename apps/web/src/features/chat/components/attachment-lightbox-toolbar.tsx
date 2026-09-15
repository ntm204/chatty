import { Download, Forward, MessageSquare, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { LIGHTBOX_TOOLBAR_BUTTON_CLASS, LIGHTBOX_ZOOM_MAX, LIGHTBOX_ZOOM_MIN } from "../constants/attachment";

interface AttachmentLightboxToolbarProps {
	zoom: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetZoom: () => void;
	onRotateCounterclockwise: () => void;
	onRotateClockwise: () => void;
	onOpenMessage?: () => void;
	onForward?: () => void;
	onSave: () => void;
	isSaving: boolean;
	canSave?: boolean;
	onClose: () => void;
}

/**
 * Rotate and zoom, as one floating pill rather than five more buttons beside
 * close and forward.
 *
 * Grouping is the point: the view tools come first, a quiet divider follows,
 * then the message actions and close. The reader finds every action in one
 * place under the image instead of scanning the viewport's corners. The view
 * controls still reset per image; message actions do not.
 *
 * It deliberately stays in normal layout flow. A floating toolbar and the
 * thumbnail strip both claiming the viewer's bottom edge will eventually draw
 * over one another; a vertical dock reserves room for both at every size.
 *
 * The percentage doubles as a button: pressing it is the fast way back to a
 * fitted picture, which a bare readout would have left one press short of.
 */
export function AttachmentLightboxToolbar({
	zoom,
	onZoomIn,
	onZoomOut,
	onResetZoom,
	onRotateCounterclockwise,
	onRotateClockwise,
	onOpenMessage,
	onForward,
	onSave,
	isSaving,
	canSave = true,
	onClose,
}: AttachmentLightboxToolbarProps) {
	return (
		<div
			onClick={(event) => event.stopPropagation()}
			className="flex max-w-full items-center gap-0.5 rounded-full bg-scrim/60 px-1.5 py-1 backdrop-blur-sm"
		>
			<Button
				variant="ghost"
				onClick={onRotateCounterclockwise}
				title="Rotate counterclockwise (Shift+R)"
				aria-label="Rotate image counterclockwise"
				className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
			>
				<RotateCcw className="size-4" />
			</Button>
			<Button
				variant="ghost"
				onClick={onRotateClockwise}
				title="Rotate clockwise (R)"
				aria-label="Rotate image clockwise"
				className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
			>
				<RotateCw className="size-4" />
			</Button>

			<span aria-hidden="true" className="mx-0.5 h-4 w-px bg-on-media/20" />

			<Button
				variant="ghost"
				onClick={onZoomOut}
				disabled={zoom <= LIGHTBOX_ZOOM_MIN}
				title="Zoom out (-)"
				aria-label="Zoom out"
				className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
			>
				<ZoomOut className="size-4" />
			</Button>
			<Button
				variant="ghost"
				onClick={onResetZoom}
				title="Reset zoom (0)"
				aria-label="Reset zoom"
				className={cn(LIGHTBOX_TOOLBAR_BUTTON_CLASS, "meta w-11 justify-center px-0")}
			>
				{Math.round(zoom * 100)}%
			</Button>
			<Button
				variant="ghost"
				onClick={onZoomIn}
				disabled={zoom >= LIGHTBOX_ZOOM_MAX}
				title="Zoom in (+)"
				aria-label="Zoom in"
				className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
			>
				<ZoomIn className="size-4" />
			</Button>

			<span aria-hidden="true" className="mx-0.5 h-4 w-px bg-on-media/20" />

			{onOpenMessage && (
				<Button
					variant="ghost"
					onClick={onOpenMessage}
					title="View in conversation"
					aria-label="View in conversation"
					className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
				>
					<MessageSquare className="size-4" />
				</Button>
			)}
			{onForward && (
				<Button
					variant="ghost"
					onClick={onForward}
					title="Forward"
					aria-label="Forward this message"
					className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
				>
					<Forward className="size-4" />
				</Button>
			)}
			<Button
				variant="ghost"
				onClick={onSave}
				disabled={isSaving || !canSave}
				title="Save"
				aria-label="Save this image"
				className={LIGHTBOX_TOOLBAR_BUTTON_CLASS}
			>
				<Download className="size-4" />
			</Button>
			<Button
				variant="ghost"
				onClick={onClose}
				title="Close"
				aria-label="Close image preview"
				className={cn(LIGHTBOX_TOOLBAR_BUTTON_CLASS, "ml-0.5")}
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}
