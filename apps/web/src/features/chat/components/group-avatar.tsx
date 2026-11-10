import { GroupSilhouetteIcon } from "@/components/icons";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";

interface GroupAvatarProps {
	size: AvatarSize;
}

/**
 * A group without a picture of its own: three grey figures, the group form of
 * the silhouette a person without a photo gets — the same neutral pair, so
 * people and groups read as one set, and neither competes with real photos.
 */
export function GroupAvatar({ size }: GroupAvatarProps) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 overflow-hidden bg-avatar-blank text-avatar-blank-figure",
				AVATAR_SIZE_CLASSES[size],
			)}
		>
			<GroupSilhouetteIcon />
		</span>
	);
}
