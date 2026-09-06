/**
 * How large an avatar renders.
 *
 * Shared rather than declared next to `Avatar`, because the size map in
 * `@/constants/avatar-sizes` is keyed by it and anything that reserves space
 * for an avatar — the group icon that stands in for one, for instance — has to
 * agree with it exactly or the rows stop lining up.
 */
export type AvatarSize = "2xs" | "xs" | "sm" | "md" | "lg";
