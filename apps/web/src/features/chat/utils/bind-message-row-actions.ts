import type { ReactionEmoji } from "@chatty/shared-types";
import type { MessageRowActions } from "../types/message-row-actions";
import type { ThreadMessage } from "../types/thread-message";
import { scrollToMessage } from "./scroll-to-message";

/** Bind below the row's memo boundary so the list passes stable callbacks. */
export function bindMessageRowActions(message: ThreadMessage, isPinned: boolean, actions: MessageRowActions) {
	return {
		onStartEdit: () => actions.onStartEdit(message.id),
		onSaveEdit: (content: string) => actions.onSaveEdit(message.id, content),
		onCancelEdit: actions.onCancelEdit,
		onDeleteForEveryone: () => actions.onDeleteMessage(message.id),
		onDeleteForMe: () => actions.onHideMessage(message.id),
		onShowHistory: () => actions.onShowHistory(message.id),
		onRetrySend: () => actions.onRetrySend(message.id),
		onDiscardDraft: () => actions.onDiscardDraft(message.id),
		onToggleReaction: (emoji: ReactionEmoji) => actions.onToggleReaction(message.id, emoji),
		onShowReactions: () => actions.onShowReactions(message.id),
		onReply: () => actions.onReplyToMessage(message),
		onForward: () => actions.onForwardMessage(message),
		onSave: () => actions.onSaveMessage(message.id),
		onTogglePin: () => actions.onTogglePinMessage(message.id, isPinned),
		onJumpToReplyOriginal: () => {
			const originalId = message.replyTo?.id;
			if (originalId && !scrollToMessage(originalId)) actions.onJumpToMessage(originalId);
		},
	};
}
