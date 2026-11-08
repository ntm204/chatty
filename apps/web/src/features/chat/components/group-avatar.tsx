import { Users } from "lucide-react";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { getAvatarGradient } from "@/utils/avatar-gradient";
import { cn } from "@/utils/cn";

interface GroupAvatarProps {
	/** The conversation id: picks the gradient, so a group keeps its colour everywhere. */
	seed: string;
	size: AvatarSize;
}

/**
 * A group without a picture of its own: a group icon on its own gradient, so
 * the group has a picture — and groups differ by colour in the list, where one
 * flat icon made them all alike.
 */
export function GroupAvatar({ seed, size }: GroupAvatarProps) {
	return (
		<span
			aria-hidden="true"
			className={cn("flex shrink-0 items-center justify-center text-on-media", AVATAR_SIZE_CLASSES[size])}
			style={{ backgroundImage: getAvatarGradient(seed) }}
		>
			<Users className="size-[52%]" strokeWidth={2.2} />
		</span>
	);
}
