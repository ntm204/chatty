import { SilhouetteIcon } from "@/components/icons";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";

interface SilhouetteAvatarProps {
	size: AvatarSize;
	className?: string;
}

/**
 * Somebody without a photo, as Messenger draws them: a plain grey head and
 * shoulders. Neutral on purpose — it says "no picture yet" and never competes
 * with the faces people did upload.
 */
export function SilhouetteAvatar({ size, className }: SilhouetteAvatarProps) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 overflow-hidden bg-avatar-blank text-avatar-blank-figure",
				AVATAR_SIZE_CLASSES[size],
				className,
			)}
		>
			<SilhouetteIcon />
		</span>
	);
}
