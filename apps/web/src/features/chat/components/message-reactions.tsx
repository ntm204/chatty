import type { ReactionDTO, ReactionEmoji, UserDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { ReactionIcon } from "@/components/icons";
import { cn } from "@/utils/cn";
import { REACTION_CHIP_LIMIT } from "../constants/reactions";
import { getReactionSummary } from "../utils";

interface MessageReactionsProps {
	reactions: ReactionDTO[];
	currentUserId: string;
	users: UserDTO[];
	/** Names the group for assistive technology: whose message these are on. */
	isMine: boolean;
	isDisabled?: boolean;
	onToggle: (emoji: ReactionEmoji) => void;
	/** Opens the reactor list. Reached from the overflow chip and from the actions menu. */
	onShowDetails: () => void;
}

/**
 * The reactions a message wears: a row of chips inside the bubble, under the
 * text — Telegram's arrangement, chosen by the owner over floating pills.
 *
 * Inside rather than hanging off the edge, so there is nothing to layer: no
 * ring, shadow or overlap, and nothing that can cover text or run off a short
 * bubble. Every floating version needed one of those and looked stuck on.
 *
 * Each chip is the emoji's doodle drawing (`ReactionIcon`) and its count, and
 * pressing it toggles your own reaction — the same toggle as the reaction bar.
 * Chips take their colour from `currentColor`, so one set of classes reads on
 * an incoming bubble, on your own bubble in any conversation theme, and on the
 * page under a photo or a file. Yours is the one filled in ink.
 *
 * Past `REACTION_CHIP_LIMIT` distinct emoji the rest collapse into `+N`, which
 * opens the reactor list rather than toggling anything. So there are at most
 * four chips, and they never wrap: a second row would sit inside the first
 * row's touch reach, and four fit in one row even at 320px.
 */
export function MessageReactions({
	reactions,
	currentUserId,
	users,
	isMine,
	isDisabled = false,
	onToggle,
	onShowDetails,
}: MessageReactionsProps) {
	const visible = reactions.slice(0, REACTION_CHIP_LIMIT);
	const hiddenCount = reactions.length - visible.length;

	return (
		<div
			role="group"
			aria-label={isMine ? "Reactions to your message" : "Reactions to received message"}
			className="message-reactions mt-1.5 -mx-1.5 flex gap-1"
		>
			{visible.map((reaction) => {
				const isReacted = reaction.userIds.includes(currentUserId);
				const count = reaction.userIds.length;

				return (
					<Button
						key={reaction.emoji}
						variant="ghost"
						onClick={() => onToggle(reaction.emoji)}
						disabled={isDisabled}
						aria-pressed={isReacted}
						aria-label={`${reaction.emoji}, ${count}`}
						title={getReactionSummary(reaction, users, currentUserId)}
						className={cn(
							"reaction-chip h-6 gap-1 rounded-full py-0 pr-2 pl-0.5",
							// Yours is filled in ink; the rest are a faint wash of whatever
							// colour the surface they sit on writes in.
							isReacted
								? "bg-ink text-paper-raised hover:bg-ink"
								: "bg-current/8 text-current hover:bg-current/14",
						)}
					>
						<ReactionIcon emoji={reaction.emoji} className="reaction-chip-icon size-5 text-[15px]" />
						<span className="meta">{count}</span>
					</Button>
				);
			})}

			{hiddenCount > 0 && (
				<Button
					variant="ghost"
					onClick={onShowDetails}
					aria-label={`${hiddenCount} more reactions. Show everyone who reacted`}
					className="reaction-chip h-6 rounded-full bg-current/8 px-2 py-0 text-current hover:bg-current/14"
				>
					<span className="meta">+{hiddenCount}</span>
				</Button>
			)}
		</div>
	);
}
