import type { ConversationDTO } from "@chatty/shared-types";
import type { ChatFolder } from "../types/conversation-list";

/** Whether a conversation belongs in a sidebar folder. */
export function isInFolder(conversation: ConversationDTO, folder: ChatFolder): boolean {
	if (folder === "unread") return conversation.unreadCount > 0;
	if (folder === "groups") return conversation.isGroup;

	return folder === "direct" ? !conversation.isGroup : true;
}
