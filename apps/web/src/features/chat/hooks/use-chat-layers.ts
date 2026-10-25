import type { MessageDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { useBackDismiss } from "@/hooks/use-back-dismiss";

interface ChatLayersOptions {
	selectedConversationId: string | null;
	isGlobalSearchOpen: boolean;
	closeGlobalSearch: () => void;
	/** A dismissed in-thread search also drops the result it was pointing at. */
	clearRequestedMessage: () => void;
}

/**
 * The panels that sit over a conversation, and the one rule they share: Back
 * closes the top one before it leaves the thread (see `useBackDismiss`).
 * Switching conversations closes all of them.
 */
export function useChatLayers({
	selectedConversationId,
	isGlobalSearchOpen,
	closeGlobalSearch,
	clearRequestedMessage,
}: ChatLayersOptions) {
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	const [isConversationSearchOpen, setIsConversationSearchOpen] = useState(false);
	const [forwardingMessage, setForwardingMessage] = useState<MessageDTO | null>(null);
	const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

	useEffect(() => {
		setIsManagingGroup(false);
		setIsConversationSearchOpen(false);
		setForwardingMessage(null);
	}, [selectedConversationId]);

	useBackDismiss(isManagingGroup, () => setIsManagingGroup(false));
	useBackDismiss(isConversationSearchOpen, () => {
		setIsConversationSearchOpen(false);
		clearRequestedMessage();
	});
	useBackDismiss(Boolean(forwardingMessage), () => setForwardingMessage(null));
	useBackDismiss(isShortcutHelpOpen, () => setIsShortcutHelpOpen(false));
	useBackDismiss(isGlobalSearchOpen, closeGlobalSearch);

	return {
		isManagingGroup,
		setIsManagingGroup,
		isConversationSearchOpen,
		setIsConversationSearchOpen,
		forwardingMessage,
		setForwardingMessage,
		isShortcutHelpOpen,
		setIsShortcutHelpOpen,
		hasOpenPanel:
			isGlobalSearchOpen ||
			isShortcutHelpOpen ||
			Boolean(forwardingMessage) ||
			isManagingGroup ||
			isConversationSearchOpen,
	};
}
