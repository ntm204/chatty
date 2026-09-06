import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/utils/cn";
import { ConnectionBanner, ChatConversationPane, ConversationSidebar, KeyboardShortcutsPanel } from "../components";
import {
	useBlockedUsersSync,
	useConversationList,
	useReplyTarget,
	useConversationMessages,
	useDocumentTitle,
	useMarkRead,
	useKeyboardShortcuts,
	useMessageListHandlers,
	useMessageNotifications,
	useMessageSound,
	usePresence,
	useRestrictedUsersSync,
	useSocketConnection,
	useTypingParticipants,
} from "../hooks";
import type { MessageSearchSession } from "../types/message-search";
import { getNewestStoredMessage, scrollToMessage } from "../utils";

export function ChatPage() {
	const currentUser = useAuth((state) => state.currentUser);
	const logout = useAuth((state) => state.logout);

	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	// The reply target lives here rather than in the composer, because the message
	// is picked in the list and answered in the composer — two siblings, so the
	// state belongs to the parent that owns both.
	const [requestedMessageId, setRequestedMessageId] = useState<string | null>(null);
	const [isConversationSearchOpen, setIsConversationSearchOpen] = useState(false);
	const [forwardingMessage, setForwardingMessage] = useState<MessageDTO | null>(null);
	const [isEditingMessage, setIsEditingMessage] = useState(false);
	const [editLastRequest, setEditLastRequest] = useState(0);
	const [cancelEditRequest, setCancelEditRequest] = useState(0);
	const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

	const refreshBlockedUsers = useBlockedUsersSync();
	const refreshRestrictedUsers = useRestrictedUsersSync();
	const onlineUserIds = usePresence();
	const { activeUserIds: typingUserIds, typingByConversation } = useTypingParticipants(selectedConversationId);
	const hasOpenPanel =
		isShortcutHelpOpen || Boolean(forwardingMessage) || isManagingGroup || isConversationSearchOpen;

	const {
		conversations,
		refresh: refreshConversations,
		paging: conversationPaging,
		isShowingArchived,
		setIsShowingArchived,
	} = useConversationList(
		currentUser?.id,
		// Deselect only when the conversation that ended is the one on screen —
		// leaving a group you were not looking at must not close the one you were.
		useCallback((conversationId: string) => {
			setSelectedConversationId((current) => (current === conversationId ? null : current));
		}, []),
	);

	useDocumentTitle(conversations);
	useMessageNotifications(currentUser?.id ?? "", conversations);
	useMessageSound(currentUser?.id ?? "", conversations, selectedConversationId);

	const {
		messages,
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		isLoadingThread,
		loadError,
		retryLoad,
		resync,
		sendMessage,
		sendSticker,
		sendFile,
		sendVoice,
		retrySend,
		discardDraft,
		trimHistory,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
		targetMessageId,
	} = useConversationMessages(selectedConversationId, refreshConversations, requestedMessageId);
	const { replyTo, setReplyTo, requestReplyTo, clearReply } = useReplyTarget(messages);

	useKeyboardShortcuts({
		hasOpenPanel,
		onClosePanel: () => {
			if (isShortcutHelpOpen) setIsShortcutHelpOpen(false);
			else if (forwardingMessage) setForwardingMessage(null);
			else if (isManagingGroup) setIsManagingGroup(false);
			else closeMessageSearch();
		},
		hasReply: Boolean(replyTo),
		onCancelReply: () => setReplyTo(null),
		isEditing: isEditingMessage,
		onCancelEdit: () => setCancelEditRequest((current) => current + 1),
		onEditLast: () => setEditLastRequest((current) => current + 1),
		onOpenConversationSearch: () => {
			if (selectedConversationId) setIsConversationSearchOpen(true);
		},
		onShowHelp: () => setIsShortcutHelpOpen(true),
	});

	const isConnectionLost = useSocketConnection(
		useCallback(() => {
			refreshConversations();
			resync();
			void refreshBlockedUsers();
			void refreshRestrictedUsers();
		}, [refreshBlockedUsers, refreshConversations, refreshRestrictedUsers, resync]),
	);

	useEffect(() => {
		setIsManagingGroup(false);
		setIsConversationSearchOpen(false);
		setForwardingMessage(null);
		clearReply();
	}, [clearReply, selectedConversationId]);

	// Reading is defined by what is on screen, so the marker follows the newest
	// loaded message rather than the newest that exists. Loading older pages
	// prepends and leaves this untouched, which is what stops scrolling up from
	// looking like unreading.
	//
	// Drafts are skipped, and that is not cosmetic: a draft's id names nothing on
	// the server, so moving the read marker to one would be a request the server
	// can only refuse.
	const newestStoredMessageId = getNewestStoredMessage(messages)?.id;
	useMarkRead(selectedConversationId, newestStoredMessageId);

	const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId);

	// Stable identities, which is what keeps the memo on `MessageRows` working
	// while this component re-renders on every typing and presence event.
	const { pinnedMessageIds, onTogglePinMessage } = useMessageListHandlers(
		selectedConversationId,
		selectedConversation?.pinnedMessages,
	);

	function handleConversationStarted(conversationId: string) {
		refreshConversations();
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function handleConversationSelected(conversationId: string) {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function selectSearchResult(session: MessageSearchSession) {
		const result = session.results[session.activeIndex];
		if (!result) return;

		setSelectedConversationId(result.conversation.id);
		setRequestedMessageId(result.message.id);
	}

	const closeMessageSearch = useCallback(() => {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
	}, []);

	// A miss means the message is outside what the thread currently holds, so the
	// search panel closes and the list is asked to load the page around it.
	const jumpToMessage = useCallback((messageId: string) => {
		if (scrollToMessage(messageId)) return;

		setIsConversationSearchOpen(false);
		setRequestedMessageId(messageId);
	}, []);

	if (!currentUser) return null;

	return (
		<div className="relative flex h-dvh flex-col overflow-hidden bg-paper">
			{isShortcutHelpOpen && <KeyboardShortcutsPanel onClose={() => setIsShortcutHelpOpen(false)} />}
			{isConnectionLost && <ConnectionBanner />}

			<div className="flex min-h-0 flex-1 lg:gap-2 lg:p-2">
				<ConversationSidebar
					currentUser={currentUser}
					conversations={conversations}
					paging={conversationPaging}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={handleConversationSelected}
					onConversationStarted={handleConversationStarted}
					onSignOut={logout}
					isShowingArchived={isShowingArchived}
					onToggleArchived={() => setIsShowingArchived(!isShowingArchived)}
					typingByConversation={typingByConversation}
					className={cn(selectedConversation && "max-lg:hidden")}
				/>

				<main
					className={cn("relative min-w-0 flex-1 flex-col", selectedConversation ? "flex" : "hidden lg:flex")}
				>
					{selectedConversation ? (
						<ChatConversationPane
							conversation={selectedConversation}
							currentUserId={currentUser.id}
							onlineUserIds={onlineUserIds}
							typingUserIds={typingUserIds}
							isManagingDetails={isManagingGroup}
							onToggleDetails={() => setIsManagingGroup((current) => !current)}
							onBack={() => {
								setReplyTo(null);
								setSelectedConversationId(null);
							}}
							isSearchOpen={isConversationSearchOpen}
							onOpenSearch={() => {
								setRequestedMessageId(null);
								setIsConversationSearchOpen(true);
							}}
							onCloseSearch={closeMessageSearch}
							onSelectSearchResult={selectSearchResult}
							onClearSearchResult={() => setRequestedMessageId(null)}
							forwardingMessage={forwardingMessage}
							conversations={conversations}
							onCloseForward={() => setForwardingMessage(null)}
							onOpenMessage={(messageId) => {
								jumpToMessage(messageId);
								setIsManagingGroup(false);
							}}
							loadError={loadError}
							onRetryLoad={retryLoad}
							messageListProps={{
								conversationId: selectedConversation.id,
								messages,
								unreadCount: selectedConversation.unreadCount,
								currentUserId: currentUser.id,
								participants: selectedConversation.participants,
								isGroup: selectedConversation.isGroup,
								themeColor: selectedConversation.themeColor,
								areReceiptsShared: currentUser.readReceiptsEnabled,
								isLoadingThread,
								hasMoreOlder,
								isLoadingOlder,
								onLoadOlder: loadOlder,
								hasMoreNewer,
								isLoadingNewer,
								onLoadNewer: loadNewer,
								onEditMessage: editMessage,
								onDeleteMessage: deleteMessage,
								onHideMessage: hideMessage,
								onRetrySend: retrySend,
								onDiscardDraft: discardDraft,
								onToggleReaction: toggleReaction,
								onReplyToMessage: setReplyTo,
								onForwardMessage: setForwardingMessage,
								onTogglePinMessage,
								pinnedMessageIds,
								onJumpToMessage: jumpToMessage,
								onTrimHistory: trimHistory,
								requestEditLast: editLastRequest,
								requestCancelEdit: cancelEditRequest,
								onEditingStateChange: setIsEditingMessage,
								targetMessageId,
								onReturnToLatest: closeMessageSearch,
							}}
							messageInputProps={{
								conversationId: selectedConversation.id,
								participants: selectedConversation.participants,
								currentUserId: currentUser.id,
								replyTo,
								onCancelReply: () => setReplyTo(null),
								onSend: sendMessage,
								onSendSticker: sendSticker,
								onSendFile: sendFile,
								onSendVoice: sendVoice,
								onRestoreReply: requestReplyTo,
							}}
						/>
					) : (
						<div className="flex flex-1 items-center justify-center">
							<p className="text-sm text-ink-faint">
								Pick a conversation, or search for someone to start one.
							</p>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
