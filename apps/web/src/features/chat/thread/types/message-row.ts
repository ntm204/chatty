import type { ReactionEmoji } from "@chatty/shared-types";
import type { ThreadMessage } from "../../types/thread-message";

/**
 * Where one message sits in a run of messages from the same author.
 *
 * The whole corner grammar hangs off this: which corners a bubble rounds, which
 * it tightens to a seam, and which one carries the notch. Derived once in the
 * list — a row cannot see its neighbours — and passed down as a single value
 * rather than as two booleans, so the four cases are named and exhaustive
 * instead of being reconstructed from `isFirst && !isLast` at each use.
 */
export type ClusterPosition = "solo" | "first" | "middle" | "last";

/** Stable, unbound actions shared by every row in a thread. */
export interface MessageRowActions {
	onStartEdit: (messageId: string) => void;
	onSaveEdit: (messageId: string, content: string) => void | Promise<void>;
	onCancelEdit: () => void;
	onDeleteMessage: (messageId: string) => void | Promise<void>;
	onHideMessage: (messageId: string) => void | Promise<void>;
	onShowHistory: (messageId: string) => void;
	onRetrySend: (messageId: string) => void;
	onDiscardDraft: (messageId: string) => void;
	onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void | Promise<void>;
	/** Opens the reactor list. One dialog for the whole thread, owned by `MessageList`. */
	onShowReactions: (messageId: string) => void;
	onReplyToMessage: (message: ThreadMessage) => void;
	onForwardMessage: (message: ThreadMessage) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void | Promise<void>;
	onJumpToMessage: (messageId: string) => void;
}

/**
 * Which floating panel a message row has open, if any.
 *
 * Two panels — the reaction bar and the actions menu — share one value rather
 * than owning a boolean each. They occupy the same corner above the same button
 * group and only one can usefully be open, and a pair of booleans is how you end
 * up with both drawn on top of each other after a fast click.
 */
export type OpenMessagePanel = "menu" | "reactions" | null;
