import { AVATAR_GROUP_MAX, AVATAR_GROUP_OVERLAP } from "@/constants/avatar-group";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarGroupPerson, AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";
import { Avatar } from "./avatar";

interface AvatarGroupProps {
	people: AvatarGroupPerson[];
	size?: AvatarSize;
	className?: string;
}

/**
 * Overlapping faces, at most three; a longer list shows two and a "+N" disc.
 *
 * Each face is cut out where the next one overlaps it (CSS mask), instead of a
 * ring in the page colour, so the stack stays clean on a wallpaper, a bubble or
 * a selected row. Hidden names are in the tooltip, since a face alone does not
 * say who it is.
 */
export function AvatarGroup({ people, size = "xs", className }: AvatarGroupProps) {
	const hasOverflow = people.length > AVATAR_GROUP_MAX;
	const shown = hasOverflow ? people.slice(0, AVATAR_GROUP_MAX - 1) : people;
	const hiddenCount = people.length - shown.length;
	const names = people.map((person) => person.name).join(", ");

	return (
		<span role="img" aria-label={names} title={names} className={cn("avatar-group inline-flex", className)}>
			{shown.map((person, index) => (
				<Avatar
					key={person.user.id}
					user={person.user}
					size={size}
					className={cn("avatar-group-item", index > 0 && AVATAR_GROUP_OVERLAP[size])}
				/>
			))}
			{hiddenCount > 0 && (
				<span
					className={cn(
						"avatar-group-item inline-flex items-center justify-center bg-avatar-blank font-semibold leading-none text-ink-soft tabular-nums",
						AVATAR_SIZE_CLASSES[size],
						AVATAR_GROUP_OVERLAP[size],
					)}
				>
					+{hiddenCount}
				</span>
			)}
		</span>
	);
}
