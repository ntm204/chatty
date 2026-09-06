import type { ConversationTheme, MessageDTO, ParticipantDTO, ReactionEmoji } from "@chatty/shared-types";
import type { ThreadMessage } from "./thread-message";

export interface MessageListProps {
	conversationId: string;
	messages: ThreadMessage[];
	unreadCount: number;
	currentUserId: string;
	participants: ParticipantDTO[];
	typingMessage?: string | null;
	/**
	 * Whether to name the author above each incoming bubble.
	 *
	 * Passed in rather than derived from `participants.length`, which is what it
	 * used to be: a three-person group that loses a member still needs the names
	 * — the messages of the person who left are exactly the ones that become
	 * unattributable without them.
	 */
	isGroup: boolean;
	/** The conversation's shared accent, replacing the fixed default for "mine" surfaces — see ADR 0022. */
	themeColor: ConversationTheme | null;
	/**
	 * Whether the viewer shares their own read receipts. False hides the "Seen"
	 * marker entirely — the setting is symmetric, so somebody who has stopped
	 * sending theirs stops seeing everyone else's.
	 */
	areReceiptsShared: boolean;
	/**
	 * True while the first page is in flight. Without it an unfinished load and
	 * an empty conversation render identically, so a slow network shows "No
	 * messages yet. Say hello." over a thread that has years in it.
	 */
	isLoadingThread: boolean;
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	onLoadOlder: () => void;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	onLoadNewer: () => void;
	/**
	 * Both write over HTTP and return once the server has accepted. Neither
	 * updates this list — the `message:updated` broadcast does, so the author
	 * sees their own change through the same path everyone else does.
	 */
	onEditMessage: (messageId: string, content: string) => void;
	onDeleteMessage: (messageId: string) => void;
	onHideMessage: (messageId: string) => void;
	/** Both act on a draft this tab failed to send, never on a stored message. */
	onRetrySend: (draftId: string) => void;
	onDiscardDraft: (draftId: string) => void;
	onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void;
	/** Puts a message in the composer's reply slot. Owned by the page, which owns the composer. */
	onReplyToMessage: (message: MessageDTO) => void;
	onForwardMessage: (message: MessageDTO) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
	pinnedMessageIds: string[];
	onJumpToMessage: (messageId: string) => void;
	/** Drops the oldest page once the thread outgrows what it needs — see `MAX_RETAINED_MESSAGES`. */
	onTrimHistory: () => void;
	requestEditLast: number;
	requestCancelEdit: number;
	onEditingStateChange: (isEditing: boolean) => void;
	targetMessageId?: string | null;
	onReturnToLatest?: () => void;
}
