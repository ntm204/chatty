import type { ReactionEmoji } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { REACTION_ICONS } from "@/constants/reaction-icons";

interface ReactionIconProps {
	emoji: ReactionEmoji;
	/** Sizes the drawing (`size-*`) or, for a system emoji, its glyph (`text-*`). */
	className?: string;
}

/**
 * A reaction as Chatty draws it: one of the doodle stickers for the six quick
 * reactions, the system emoji for anything else. Decorative — whatever holds it
 * names the reaction.
 */
export function ReactionIcon({ emoji, className }: ReactionIconProps) {
	const shapes = REACTION_ICONS[emoji];

	if (!shapes) {
		return (
			<span aria-hidden="true" className={cn("leading-none", className)}>
				{emoji}
			</span>
		);
	}

	return (
		<svg aria-hidden="true" viewBox="0 0 32 32" className={cn("shrink-0", className)}>
			{shapes.map(({ kind: Shape, ...attributes }, index) => (
				<Shape key={index} strokeLinecap="round" strokeLinejoin="round" {...attributes} />
			))}
		</svg>
	);
}
