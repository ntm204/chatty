import type { ReactionEmoji } from "@chatty/shared-types";
import type { ThreadMessage } from "./thread-message";

/** Stable, unbound actions shared by every row in a thread. */
export interface MessageRowActions {
	onStartEdit: (messageId: string) => void;
	onSaveEdit: (messageId: string, content: string) => void;
	onCancelEdit: () => void;
	onDeleteMessage: (messageId: string) => void;
	onHideMessage: (messageId: string) => void;
	onShowHistory: (messageId: string) => void;
	onRetrySend: (messageId: string) => void;
	onDiscardDraft: (messageId: string) => void;
	onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void;
	/** Opens the reactor list. One dialog for the whole thread, owned by `MessageList`. */
	onShowReactions: (messageId: string) => void;
	onReplyToMessage: (message: ThreadMessage) => void;
	onForwardMessage: (message: ThreadMessage) => void;
	onSaveMessage: (messageId: string) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
	onJumpToMessage: (messageId: string) => void;
}
