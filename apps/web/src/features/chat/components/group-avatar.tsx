import type { UserDTO } from "@chatty/shared-types";
import { GroupSilhouetteIcon, SilhouetteIcon } from "@/components/icons";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";

interface GroupAvatarProps {
	size: AvatarSize;
	/** The other members, photo holders first; their faces stand in for a group picture. */
	members?: UserDTO[];
}

/**
 * A group without a picture of its own.
 *
 * Once a member has a photo, two members' faces overlap diagonally, as
 * Messenger does: the group is recognisable by who is in it. The back face is
 * cut out around the front one (CSS mask), so the gap is transparent on any
 * row colour. Until anyone has a photo, three grey figures — the group form of
 * a person's silhouette.
 */
export function GroupAvatar({ size, members = [] }: GroupAvatarProps) {
	const faces = members.some((member) => member.avatarUrl) ? members.slice(0, 2) : [];
	if (faces.length < 2) {
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

	return (
		<span aria-hidden="true" className={cn("relative shrink-0", AVATAR_SIZE_CLASSES[size])}>
			{faces.map((member, index) => (
				<span
					key={member.id}
					className={cn(
						"absolute flex size-[68%] overflow-hidden rounded-full bg-avatar-blank text-avatar-blank-figure",
						index === 0 ? "group-avatar-back top-0 right-0" : "bottom-0 left-0",
					)}
				>
					{member.avatarUrl ? (
						<img src={member.avatarUrl} alt="" className="size-full object-cover" />
					) : (
						<SilhouetteIcon />
					)}
				</span>
			))}
		</span>
	);
}
