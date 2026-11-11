import type { AvatarSize } from "@/types/avatar";

/**
 * Faces an avatar group shows before folding the rest into a "+N" disc. Past
 * three, two faces plus the count read faster than a row of strangers
 * (Innovaccer's AvatarGroup rule; docs/design/references.md).
 */
export const AVATAR_GROUP_MAX = 3;

/** Each face after the first slides a quarter of its width under the one before; the CSS mask assumes this. */
export const AVATAR_GROUP_OVERLAP: Record<AvatarSize, string> = {
	"2xs": "-ml-[3.5px]",
	xs: "-ml-[5px]",
	sm: "-ml-2",
	md: "-ml-[11px]",
	lg: "-ml-4",
};
