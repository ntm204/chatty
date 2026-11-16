import { cn } from "@/utils/cn";
import { CROP_SIZE } from "./constants";

interface AvatarCropApertureProps {
	isDragging: boolean;
}

/**
 * Circular aperture guide with a photography rule-of-thirds alignment grid.
 */
export function AvatarCropAperture({ isDragging }: AvatarCropApertureProps) {
	return (
		<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div
				style={{ width: CROP_SIZE, height: CROP_SIZE }}
				className="relative rounded-full border-2 border-on-media/80 shadow-[0_0_0_9999px_rgba(12,11,40,0.65)]"
			>
				{/* Subtle 3x3 grid */}
				<div
					className={cn(
						"absolute inset-0 grid grid-cols-3 grid-rows-3 overflow-hidden rounded-full transition-opacity duration-150",
						isDragging ? "opacity-40" : "opacity-20",
					)}
				>
					<div className="border-r border-b border-on-media" />
					<div className="border-r border-b border-on-media" />
					<div className="border-b border-on-media" />
					<div className="border-r border-b border-on-media" />
					<div className="border-r border-b border-on-media" />
					<div className="border-b border-on-media" />
					<div className="border-r border-b border-on-media" />
					<div className="border-r border-b border-on-media" />
					<div />
				</div>
			</div>
		</div>
	);
}
