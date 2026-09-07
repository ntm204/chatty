import type { UserDTO } from "@chatty/shared-types";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { getAvatarColor } from "@/utils/avatar-color";
import { cn } from "@/utils/cn";
import { getInitials } from "@/utils/get-initials";

interface AvatarProps {
	user: UserDTO;
	size?: AvatarSize;
	/** Accepted so callers that track presence don't need a special case — the UI no longer marks it. */
	isOnline?: boolean;
	className?: string;
}

/**
 * Someone's face, or the initials standing in for it.
 *
 * Circular everywhere so a person keeps one silhouette across the inbox,
 * thread, member list and settings. Initials stay mono because they are a
 * machine's reduction of a name rather than the name itself.
 */
export function Avatar({ user, size = "md", className }: AvatarProps) {
	const initials = getInitials(user.displayName);

	return (
		<span className={cn("chatty-avatar relative inline-flex shrink-0", className)}>
			{user.avatarUrl ? (
				<img
					src={user.avatarUrl}
					// The name, not "avatar of the name": a screen reader already says
					// "image", and the surrounding row usually says the name too, so
					// this is decoration next to a label it would otherwise duplicate.
					alt=""
					className={cn("object-cover", AVATAR_SIZE_CLASSES[size])}
				/>
			) : (
				<span
					aria-hidden="true"
					className={cn(
						"flex items-center justify-center font-mono font-semibold tracking-tight",
						AVATAR_SIZE_CLASSES[size],
						getAvatarColor(user.id),
					)}
				>
					{initials}
				</span>
			)}
		</span>
	);
}
