import type { ConversationDTO } from "@chatty/shared-types";
import { isConversationMuted } from "../../utils/conversation-mute";
import { CHAT_FOLDERS } from "../constants/conversation-list";
import type { ChatFolder, FolderSummary } from "../types/conversation-list";
import { isInFolder } from "./filter-by-folder";

/**
 * Per folder: how many chats it holds and how many of them are unread. A muted
 * chat counts toward the folder but not toward its unread mark — muting means
 * "don't call me over", and a dot on the tab is calling.
 */
export function summarizeFolders(conversations: ConversationDTO[]): Record<ChatFolder, FolderSummary> {
	const summary = Object.fromEntries(CHAT_FOLDERS.map(({ id }) => [id, { total: 0, unread: 0 }])) as Record<
		ChatFolder,
		FolderSummary
	>;
	for (const conversation of conversations) {
		const isUnread = conversation.unreadCount > 0 && !isConversationMuted(conversation);
		for (const { id } of CHAT_FOLDERS) {
			if (!isInFolder(conversation, id)) continue;
			summary[id].total += 1;
			if (isUnread) summary[id].unread += 1;
		}
	}

	return summary;
}
