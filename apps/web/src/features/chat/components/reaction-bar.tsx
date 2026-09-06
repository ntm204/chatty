import type { ReactionEmoji } from "@chatty/shared-types";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { QUICK_REACTIONS } from "../constants/reactions";
import { EmojiPicker } from "./emoji-picker";

interface ReactionBarProps {
	/** The one emoji this viewer has left, so the row can show which is set. Null if none. */
	myEmoji: ReactionEmoji | null;
	onPick: (emoji: ReactionEmoji) => void;
	align: "start" | "end";
}

/**
 * Six emoji and a way to the rest, floating over the message being reacted to.
 *
 * The shape every messenger converged on, and it is worth naming why rather than
 * copying it: reactions have a very short head. Six covers almost every one
 * anybody leaves, so putting them one click away and everything else two is not
 * a compromise between speed and range — it is the distribution.
 *
 * This replaced a row of five lucide line icons buried at the top of the "more"
 * menu. That cost two clicks for the commonest action in the feature, and it
 * drew each reaction as an outline glyph that then appeared on the bubble as a
 * colour emoji, so nothing you clicked looked like what you got.
 *
 * `+` swaps the row for the composer's own picker rather than opening a second
 * one beside it. One panel, one search field, one recent list — and the recents
 * are shared, so an emoji used in a message is one click away as a reaction.
 *
 * Dismissal is the caller's: this sits inside `MessageActions`, which already
 * closes on Escape and on a pointer landing outside it, and a second copy of
 * that logic here would mean two things racing to unmount the same element.
 */
export function ReactionBar({ myEmoji, onPick, align }: ReactionBarProps) {
	const [isBrowsingAll, setIsBrowsingAll] = useState(false);
	const anchor = cn(
		"absolute bottom-full z-30 mb-2",
		align === "end" ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left",
	);

	if (isBrowsingAll) {
		return <EmojiPicker onPick={onPick} onClose={() => setIsBrowsingAll(false)} anchor={anchor} />;
	}

	return (
		<div
			role="menu"
			aria-label="React to message"
			className={cn(
				anchor,
				"flex items-center gap-0.5 rounded-full border border-rule bg-paper-raised p-1 shadow-lift",
			)}
		>
			{QUICK_REACTIONS.map((emoji) => {
				const isPicked = emoji === myEmoji;

				return (
					<Button
						key={emoji}
						variant="ghost"
						role="menuitem"
						onClick={() => onPick(emoji)}
						aria-pressed={isPicked}
						aria-label={isPicked ? `Remove ${emoji}` : `React with ${emoji}`}
						className={cn(
							"size-9 rounded-full p-0 text-[22px] leading-none transition-transform duration-150 ease-out",
							"hover:-translate-y-1.5 hover:scale-125 hover:bg-transparent",
							isPicked && "bg-paper-sunken ring-1 ring-ink/20 hover:bg-paper-sunken",
						)}
					>
						<span aria-hidden="true">{emoji}</span>
					</Button>
				);
			})}

			<span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-rule-soft" />

			<Button
				variant="ghost"
				role="menuitem"
				onClick={() => setIsBrowsingAll(true)}
				aria-label="Choose another emoji"
				className="size-9 rounded-full p-0 text-ink-soft hover:bg-paper-sunken hover:text-ink"
			>
				<Plus className="size-4" />
			</Button>
		</div>
	);
}
