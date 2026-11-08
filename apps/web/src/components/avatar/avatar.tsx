import type { UserDTO } from "@chatty/shared-types";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";
import { SilhouetteAvatar } from "./silhouette-avatar";

interface AvatarProps {
	user: UserDTO;
	size?: AvatarSize;
	/** Draws the green presence dot at the bottom-right, as every messenger does. */
	isOnline?: boolean;
	className?: string;
}

/**
 * Someone's photo, or the grey silhouette standing in for one.
 *
 * Circular everywhere so a person keeps one silhouette across the inbox,
 * thread, member list and settings. The wrapper is round too, so a ring or
 * shadow a caller adds follows the face. There is no default outline: a face
 * separates from the page by its own fill.
 */
export function Avatar({ user, size = "md", isOnline = false, className }: AvatarProps) {
	return (
		<span className={cn("chatty-avatar relative inline-flex shrink-0 rounded-full", className)}>
			{user.avatarUrl ? (
				<img src={user.avatarUrl} alt="" className={cn("object-cover", AVATAR_SIZE_CLASSES[size])} />
			) : (
				<SilhouetteAvatar size={size} />
			)}
			{isOnline && size !== "2xs" && size !== "xs" && (
				<span
					role="img"
					aria-label="Online"
					className="avatar-online-dot absolute right-0 bottom-0 rounded-full bg-live"
				/>
			)}
		</span>
	);
}
