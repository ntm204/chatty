import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { isConversationMuted } from "./conversation-mute";

interface AlertContext {
	conversation: ConversationDTO;
	isRestricted: boolean;
}

// Popup and sound share metadata requests; bursts cannot start unbounded lookups.
const pendingContexts = new Map<string, Promise<AlertContext>>();
const MAX_PENDING_CONTEXTS = 8;

export async function canAlertForMessage(
	userId: string,
	message: MessageDTO,
	getConversation: () => ConversationDTO | undefined,
): Promise<boolean> {
	if (!message.author || message.author.id === userId || useAuth.getState().currentUser?.id !== userId) return false;
	const authorId = message.author.id;
	const key = `${userId}:${message.conversationId}:${authorId}`;
	let context = pendingContexts.get(key);
	if (!context) {
		if (pendingContexts.size >= MAX_PENDING_CONTEXTS) return false;
		context = (async () => {
			const conversation = getConversation() ?? (await api.getConversation(message.conversationId));
			const restriction = useRestrictedUsers.getState();
			const isRestricted =
				!conversation.isGroup &&
				(restriction.checkedIds.has(authorId)
					? restriction.restrictedIds.has(authorId)
					: (await api.getRestrictionStatus(authorId)).isRestricted);

			return { conversation, isRestricted };
		})().finally(() => pendingContexts.delete(key));
		pendingContexts.set(key, context);
	}
	try {
		const resolved = await context;
		if (useAuth.getState().currentUser?.id !== userId) return false;
		const conversation = getConversation() ?? resolved.conversation;
		const restriction = useRestrictedUsers.getState();
		const isRestricted = restriction.checkedIds.has(authorId)
			? restriction.restrictedIds.has(authorId)
			: resolved.isRestricted;
		if (!conversation.isGroup && isRestricted) return false;

		return !isConversationMuted(conversation) || message.mentionedUserIds.includes(userId);
	} catch {
		// Unknown membership/privacy cannot authorize a popup or a sound.
		return false;
	}
}
