import type { ConversationTheme, ReactionDTO, ReactionEmoji, UserDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../constants/conversation-theme";
import { REACTION_CHIP_LIMIT } from "../constants/reactions";
import { getReactionSummary } from "../utils";

interface MessageReactionsProps {
	reactions: ReactionDTO[];
	currentUserId: string;
	users: UserDTO[];
	/** Which side the bubble sits on — the pill hangs off its inner corner. */
	isMine: boolean;
	/** The conversation's shared accent, replacing the fixed default for a "mine" chip — see ADR 0022. */
	themeColor: ConversationTheme | null;
	onToggle: (emoji: ReactionEmoji) => void;
	/** Opens the reactor list. Reached from the overflow count and from the actions menu. */
	onShowDetails: () => void;
}

/**
 * The reactions a message wears, straddling its bottom edge.
 *
 * **One pill, not one chip per emoji.** Each emoji used to carry its own border,
 * its own `ring-2` cut-out and its own shadow, and the group overlapped them with
 * negative spacing — so three reactions drew three borders, three haloes and
 * three shadows into a 60px strip and read as clutter stuck to the corner of the
 * bubble. Instagram draws the same information as a single small capsule with
 * the emoji sitting inside it, and that is what this is: the chrome is paid for
 * once, by the container, and the emoji inside are bare.
 *
 * **Half on the bubble and half on the page**, which is the arrangement
 * Messenger and Instagram both use and the single biggest thing this component
 * used to get wrong: it hung clear of the bubble by 18px, so it read as something
 * that had fallen off rather than as a sticker put on. `top-full` puts the pill's
 * top edge on the bubble's bottom edge and `-translate-y-1/2` lifts it by half its
 * own height, so the overlap stays exact at any pill height and the row below only
 * has to reserve the half that hangs.
 *
 * It sits at the bubble's *inner* corner — bottom-right of an incoming message,
 * bottom-left of one you sent. Two reasons, and neither is symmetry: it stays off
 * the window edge on a narrow screen, and it lands nearer the middle of the
 * thread, which is where the eye already is.
 *
 * `ring-2 ring-paper` is still here and still load-bearing, but now there is one
 * of it. An incoming bubble is `bg-paper-raised`, the same fill as this pill, so
 * without a page-coloured ring cut between them the two surfaces merge and the
 * reactions look printed on the message. The ring is what makes it an object
 * resting on top.
 *
 * Past three distinct emoji the rest collapse into one `+N`, which opens the
 * reactor list rather than toggling anything. An open emoji set has no ceiling on
 * how many emoji a group can put on one sentence, and the bubble does.
 */
export function MessageReactions({
	reactions,
	currentUserId,
	users,
	isMine,
	themeColor,
	onToggle,
	onShowDetails,
}: MessageReactionsProps) {
	const theme = getConversationThemeClasses(themeColor);
	const visible = reactions.slice(0, REACTION_CHIP_LIMIT);
	const hiddenCount = reactions.length - visible.length;

	return (
		<div
			role="group"
			aria-label={isMine ? "Reactions to your message" : "Reactions to received message"}
			className={cn(
				"absolute top-full z-10 flex h-5 -translate-y-1/2 items-center gap-0.5 px-1",
				"rounded-full border border-rule bg-paper-raised ring-2 ring-paper shadow-reaction",
				isMine ? "left-2.5" : "right-2.5",
			)}
		>
			{visible.map((reaction) => {
				const isReacted = reaction.userIds.includes(currentUserId);
				const count = reaction.userIds.length;

				return (
					<Button
						key={reaction.emoji}
						variant="ghost"
						onClick={() => onToggle(reaction.emoji)}
						aria-pressed={isReacted}
						aria-label={`${reaction.emoji}, ${count}`}
						aria-description={getReactionSummary(reaction, users, currentUserId)}
						className={cn(
							"h-4 rounded-full py-0 transition",
							count > 1 ? "gap-0.5 px-1" : "w-4 p-0",
							// Yours is a filled disc rather than a tinted chip. The palette
							// spends its one colour on unread counts and things you cannot
							// undo, and a reaction is neither — so "mine" is said with the
							// ink block the app already uses for a message you sent, at the
							// smallest size that still reads as deliberate.
							isReacted ? theme.reacted : "hover:bg-transparent",
						)}
					>
						<span aria-hidden="true" className="text-[12px] leading-none">
							{reaction.emoji}
						</span>
						{count > 1 && <span className="meta">{count}</span>}
					</Button>
				);
			})}

			{hiddenCount > 0 && (
				<Button
					variant="ghost"
					onClick={onShowDetails}
					aria-label={`${hiddenCount} more reactions. Show everyone who reacted`}
					className="h-4 rounded-full px-1 py-0 text-ink-soft transition hover:bg-transparent hover:text-ink"
				>
					<span className="meta">+{hiddenCount}</span>
				</Button>
			)}
		</div>
	);
}
