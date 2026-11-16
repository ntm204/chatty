import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { AvatarCropAperture } from "./avatar-crop-aperture";
import { AvatarCropControls } from "./avatar-crop-controls";
import { CROP_OFFSET, CROP_SIZE, MAX_ZOOM, MIN_ZOOM, OUTPUT_SIZE, VIEWPORT_SIZE } from "./constants";

interface AvatarCropDialogProps {
	file: File;
	title?: string;
	onCrop: (croppedFile: File) => void;
	onClose: () => void;
}

/**
 * Professional circular avatar cropper: interactive pan, zoom, 90° rotation,
 * horizontal flip, rule-of-thirds grid, and high-resolution canvas export.
 */
export function AvatarCropDialog({ file, title = "Crop photo", onCrop, onClose }: AvatarCropDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close, { closeOnEscape: false });
	const imageRef = useRef<HTMLImageElement>(null);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [isFlipped, setIsFlipped] = useState(false);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [isApplying, setIsApplying] = useState(false);

	const dragStartRef = useRef<{ clientX: number; clientY: number; initialX: number; initialY: number }>({
		clientX: 0,
		clientY: 0,
		initialX: 0,
		initialY: 0,
	});

	useEffect(() => {
		const url = URL.createObjectURL(file);
		setImageUrl(url);

		return () => URL.revokeObjectURL(url);
	}, [file]);

	function handleImageLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
		const img = event.currentTarget;
		setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
		setZoom(1);
		setOffset({ x: 0, y: 0 });
		setRotation(0);
		setIsFlipped(false);
	}

	const baseScale = naturalSize ? Math.max(CROP_SIZE / naturalSize.width, CROP_SIZE / naturalSize.height) : 1;
	const currentScale = baseScale * zoom;
	const displayedWidth = (naturalSize?.width ?? 0) * currentScale;
	const displayedHeight = (naturalSize?.height ?? 0) * currentScale;

	const maxOffsetX = Math.max(0, (displayedWidth - CROP_SIZE) / 2);
	const maxOffsetY = Math.max(0, (displayedHeight - CROP_SIZE) / 2);

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		event.preventDefault();
		dragStartRef.current = {
			clientX: event.clientX,
			clientY: event.clientY,
			initialX: offset.x,
			initialY: offset.y,
		};
		setIsDragging(true);
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		if (!isDragging) return;
		const deltaX = event.clientX - dragStartRef.current.clientX;
		const deltaY = event.clientY - dragStartRef.current.clientY;
		const nextX = dragStartRef.current.initialX + deltaX;
		const nextY = dragStartRef.current.initialY + deltaY;
		setOffset({
			x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
			y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
		});
	}

	function handlePointerUp() {
		setIsDragging(false);
	}

	function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
		event.preventDefault();
		const delta = -event.deltaY * 0.002;
		setZoom((previous) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previous + delta)));
	}

	function rotateClockwise() {
		setRotation((previous) => (previous + 90) % 360);
	}

	function toggleFlip() {
		setIsFlipped((previous) => !previous);
	}

	function resetTransform() {
		setZoom(1);
		setOffset({ x: 0, y: 0 });
		setRotation(0);
		setIsFlipped(false);
	}

	function applyCrop() {
		setIsApplying(true);
		const img = imageRef.current;
		if (!img || !naturalSize) {
			onCrop(file);
			onClose();

			return;
		}

		const canvas = document.createElement("canvas");
		canvas.width = OUTPUT_SIZE;
		canvas.height = OUTPUT_SIZE;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			onCrop(file);
			onClose();

			return;
		}

		const ratio = OUTPUT_SIZE / CROP_SIZE;
		const imgLeft = VIEWPORT_SIZE / 2 + offset.x - displayedWidth / 2;
		const imgTop = VIEWPORT_SIZE / 2 + offset.y - displayedHeight / 2;

		const canvasX = (imgLeft - CROP_OFFSET) * ratio;
		const canvasY = (imgTop - CROP_OFFSET) * ratio;
		const canvasW = displayedWidth * ratio;
		const canvasH = displayedHeight * ratio;

		ctx.save();
		ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
		if (isFlipped) ctx.scale(-1, 1);
		if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
		ctx.translate(-OUTPUT_SIZE / 2, -OUTPUT_SIZE / 2);
		ctx.drawImage(img, canvasX, canvasY, canvasW, canvasH);
		ctx.restore();

		canvas.toBlob(
			(blob) => {
				setIsApplying(false);
				if (!blob) {
					onCrop(file);
					onClose();

					return;
				}
				const croppedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
					type: "image/jpeg",
				});
				onCrop(croppedFile);
				onClose();
			},
			"image/jpeg",
			0.94,
		);
	}

	const canReset = zoom !== 1 || rotation !== 0 || isFlipped || offset.x !== 0 || offset.y !== 0;

	return (
		<div
			className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4 backdrop-blur-xs"
			onClick={(event) => {
				if (event.target === event.currentTarget && !isApplying) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				tabIndex={-1}
				className="dialog-enter flex w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">{title}</h2>
					<Button
						variant="ghost"
						aria-label="Close crop dialog"
						onClick={onClose}
						disabled={isApplying}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex flex-col items-center gap-3.5 p-4">
					{/* Interactive crop viewport */}
					<div
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
						onWheel={handleWheel}
						style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
						className={cn(
							"relative overflow-hidden rounded-2xl bg-scrim touch-none select-none",
							isDragging ? "cursor-grabbing" : "cursor-grab",
						)}
					>
						{imageUrl && (
							<img
								ref={imageRef}
								src={imageUrl}
								alt="Photo to crop"
								onLoad={handleImageLoaded}
								draggable={false}
								style={{
									width: naturalSize ? `${displayedWidth}px` : "auto",
									height: naturalSize ? `${displayedHeight}px` : "auto",
									transform: `translate(${VIEWPORT_SIZE / 2 + offset.x - displayedWidth / 2}px, ${
										VIEWPORT_SIZE / 2 + offset.y - displayedHeight / 2
									}px) rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
									transformOrigin: "center center",
								}}
								className="pointer-events-none absolute top-0 left-0 max-w-none"
							/>
						)}

						{/* Circular aperture guide with Rule of Thirds grid */}
						<AvatarCropAperture isDragging={isDragging} />
					</div>

					<p className="meta text-center text-ink-faint">Drag to align face · Scroll or use slider to zoom</p>

					{/* Tool actions: Zoom slider, Rotate, Flip, Reset */}
					<AvatarCropControls
						zoom={zoom}
						minZoom={MIN_ZOOM}
						maxZoom={MAX_ZOOM}
						isFlipped={isFlipped}
						canReset={canReset}
						onZoomChange={setZoom}
						onRotate={rotateClockwise}
						onFlip={toggleFlip}
						onReset={resetTransform}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-rule p-3">
					<Button variant="ghost" onClick={onClose} disabled={isApplying} className="px-4 py-2">
						Cancel
					</Button>
					<Button onClick={applyCrop} disabled={isApplying} className="px-5 py-2">
						{isApplying ? (
							<>
								<Loader2 className="size-3.5 animate-spin mr-1.5" />
								Applying…
							</>
						) : (
							"Apply"
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
