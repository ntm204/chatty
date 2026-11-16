import { FlipHorizontal, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/button";
import { ZOOM_STEP } from "./constants";

interface AvatarCropControlsProps {
	zoom: number;
	minZoom: number;
	maxZoom: number;
	isFlipped: boolean;
	canReset: boolean;
	onZoomChange: (zoom: number) => void;
	onRotate: () => void;
	onFlip: () => void;
	onReset: () => void;
}

/**
 * Control toolbar for the avatar cropper: zoom slider, step buttons,
 * 90° rotation, horizontal flip, and reset button.
 */
export function AvatarCropControls({
	zoom,
	minZoom,
	maxZoom,
	isFlipped,
	canReset,
	onZoomChange,
	onRotate,
	onFlip,
	onReset,
}: AvatarCropControlsProps) {
	return (
		<div className="flex w-full flex-col gap-2.5">
			{/* Zoom slider & percentage */}
			<div className="flex w-full items-center gap-2.5 px-2">
				<Button
					variant="ghost"
					onClick={() => onZoomChange(Math.max(minZoom, zoom - ZOOM_STEP))}
					disabled={zoom <= minZoom}
					aria-label="Zoom out"
					className="size-7 p-0 text-ink-soft"
				>
					<ZoomOut className="size-3.5" />
				</Button>
				<input
					type="range"
					min={minZoom}
					max={maxZoom}
					step="0.01"
					value={zoom}
					onChange={(event) => onZoomChange(Number(event.target.value))}
					aria-label="Zoom photo"
					className="h-1.5 flex-1 cursor-pointer accent-ink"
				/>
				<Button
					variant="ghost"
					onClick={() => onZoomChange(Math.min(maxZoom, zoom + ZOOM_STEP))}
					disabled={zoom >= maxZoom}
					aria-label="Zoom in"
					className="size-7 p-0 text-ink-soft"
				>
					<ZoomIn className="size-3.5" />
				</Button>
				<span className="w-10 text-right text-[11px] font-medium text-ink-soft">{Math.round(zoom * 100)}%</span>
			</div>

			{/* Tool actions: Rotate, Flip, Reset */}
			<div className="flex items-center justify-center gap-2 border-t border-rule-soft pt-2">
				<Button
					variant="outline"
					onClick={onRotate}
					aria-label="Rotate 90 degrees"
					className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal"
				>
					<RotateCw className="size-3.5 text-ink-soft" />
					Rotate
				</Button>
				<Button
					variant={isFlipped ? "primary" : "outline"}
					onClick={onFlip}
					aria-label="Flip horizontal"
					className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal"
				>
					<FlipHorizontal className="size-3.5 text-ink-soft" />
					Flip
				</Button>
				{canReset && (
					<Button
						variant="ghost"
						onClick={onReset}
						aria-label="Reset photo crop"
						className="h-8 gap-1 rounded-full px-2.5 text-xs text-ink-faint hover:text-ink"
					>
						<RotateCcw className="size-3" />
						Reset
					</Button>
				)}
			</div>
		</div>
	);
}
