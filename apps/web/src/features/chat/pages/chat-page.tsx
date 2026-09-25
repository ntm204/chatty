import { GlobalMessageSearch } from "../components/global-message-search";
import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useGlobalSearchSession } from "../hooks/use-global-search-session";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/utils/cn";
import { ChatWelcome } from "../components/chat-welcome";
import { ConnectionBanner, ChatConversationPane, ConversationSidebar, KeyboardShortcutsPanel } from "../components";
import {
	useBlockedUsersSync,
	useConversationList,
	useConversationNavigation,
	useReplyTarget,
	useConversationMessages,
	useDocumentTitle,
	useKeyboardShortcuts,
	useMessageListHandlers,
	useMessageNotifications,
	useMessageSound,
	useOutboxReplay,
	usePresence,
	useRestrictedUsersSync,
	useSocketConnection,
	useTypingParticipants,
} from "../hooks";
import { findFirstUnreadConversation, getTotalUnreadCount } from "../utils";

export function ChatPage() {
	const currentUser = useAuth((state) => state.currentUser);
	const logout = useAuth((state) => state.logout);

	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
	const [openedSavedConversation, setOpenedSavedConversation] = useState<ConversationDTO | null>(null);
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	const [requestedMessageId, setRequestedMessageId] = useState<string | null>(null);
	const [isConversationSearchOpen, setIsConversationSearchOpen] = useState(false);
	const [forwardingMessage, setForwardingMessage] = useState<MessageDTO | null>(null);
	const [isEditingMessage, setIsEditingMessage] = useState(false);
	const [editLastRequest, setEditLastRequest] = useState(0);
	const [cancelEditRequest, setCancelEditRequest] = useState(0);
	const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
	const globalSearch = useGlobalSearchSession();
	const handleUnavailableMessageNavigation = useCallback(() => setRequestedMessageId(null), []);

	const refreshBlockedUsers = useBlockedUsersSync();
	const refreshRestrictedUsers = useRestrictedUsersSync();
	const onlineUserIds = usePresence();
	const { activeUserIds: typingUserIds, typingByConversation } = useTypingParticipants(selectedConversationId);
	const hasOpenPanel =
		globalSearch.isOpen ||
		isShortcutHelpOpen ||
		Boolean(forwardingMessage) ||
		isManagingGroup ||
		isConversationSearchOpen;

	const {
		conversations,
		refresh: refreshConversations,
		paging: conversationPaging,
		isShowingArchived,
		setIsShowingArchived,
	} = useConversationList(
		currentUser?.id,
		useCallback((conversationId: string) => {
			setSelectedConversationId((current) => (current === conversationId ? null : current));
		}, []),
	);

	useDocumentTitle(conversations);
	useMessageSound(currentUser?.id ?? "", conversations, selectedConversationId);
	useOutboxReplay({ userId: currentUser?.id, activeConversationId: selectedConversationId });

	const messageState = useConversationMessages(
		selectedConversationId,
		refreshConversations,
		requestedMessageId,
		handleUnavailableMessageNavigation,
	);
	const { replyTo, setReplyTo, requestReplyTo, clearReply } = useReplyTarget(messageState.messages);

	useKeyboardShortcuts({
		hasOpenPanel,
		onClosePanel: () => {
			if (globalSearch.isOpen) globalSearch.close();
			else if (isShortcutHelpOpen) setIsShortcutHelpOpen(false);
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
			messageState.resync();
			void refreshBlockedUsers();
			void refreshRestrictedUsers();
		}, [messageState.resync, refreshBlockedUsers, refreshConversations, refreshRestrictedUsers]),
	);

	useEffect(() => {
		setIsManagingGroup(false);
		setIsConversationSearchOpen(false);
		setForwardingMessage(null);
		clearReply();
	}, [clearReply, selectedConversationId]);

	const selectedConversation =
		conversations.find((conversation) => conversation.id === selectedConversationId) ??
		(openedSavedConversation?.id === selectedConversationId ? openedSavedConversation : undefined);

	const { pinnedMessageIds, onTogglePinMessage } = useMessageListHandlers(
		selectedConversationId,
		selectedConversation?.pinnedMessages,
	);

	const {
		handleConversationStarted,
		handleConversationSelected,
		selectSearchResult,
		closeMessageSearch,
		openFirstUnreadConversation,
		jumpToMessage,
	} = useConversationNavigation({
		conversations,
		refreshConversations,
		setSelectedConversationId,
		setOpenedSavedConversation,
		setRequestedMessageId,
		setIsConversationSearchOpen,
	});
	const openNotificationConversation = useCallback(
		async (conversationId: string) => {
			try {
				// A hidden or archived conversation may not be in the sidebar page, so
				// navigation needs its DTO before ChatPage can render the thread.
				const conversation = await api.getConversation(conversationId);
				handleConversationStarted(conversation.id, conversation);
			} catch {
				// Lost membership or a transient request must not replace the current
				// conversation with an empty pane after a notification click.
			}
		},
		[handleConversationStarted],
	);
	useMessageNotifications(currentUser?.id ?? "", conversations, openNotificationConversation);

	if (!currentUser) return null;

	return (
		<div className="chat-shell relative flex h-dvh flex-col overflow-hidden bg-paper">
			{globalSearch.isOpen && (
				<GlobalMessageSearch
					search={globalSearch.search}
					scrollPosition={globalSearch.scrollPosition}
					currentUserId={currentUser.id}
					onClose={globalSearch.close}
					onSelectMessage={(conversation, messageId) => {
						handleConversationStarted(conversation.id, conversation);
						setRequestedMessageId(messageId);
						globalSearch.selectConversation(conversation.id);
						globalSearch.close();
					}}
				/>
			)}
			{isShortcutHelpOpen && <KeyboardShortcutsPanel onClose={() => setIsShortcutHelpOpen(false)} />}
			{isConnectionLost && <ConnectionBanner />}

			<div className="chat-workspace flex min-h-0 flex-1 lg:gap-3 lg:p-3">
				<ConversationSidebar
					currentUser={currentUser}
					conversations={conversations}
					paging={conversationPaging}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={handleConversationSelected}
					onConversationStarted={handleConversationStarted}
					onSignOut={logout}
					onOpenMessageSearch={globalSearch.open}
					onOpenBookmarkedMessage={(conversation, messageId) => {
						handleConversationStarted(conversation.id, conversation);
						setRequestedMessageId(messageId);
					}}
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
							onCloseForward={() => setForwardingMessage(null)}
							onOpenMessage={(messageId) => {
								jumpToMessage(messageId);
								setIsManagingGroup(false);
							}}
							onReturnToGlobalSearch={
								globalSearch.conversationId === selectedConversation.id && requestedMessageId
									? globalSearch.open
									: undefined
							}
							loadError={messageState.loadError}
							navigationError={messageState.navigationError}
							onDismissNavigationError={messageState.dismissNavigationError}
							hasUnsavedMessages={messageState.hasUnsavedMessages}
							onRetryLoad={messageState.retryLoad}
							messageListProps={{
								conversationId: selectedConversation.id,
								messages: messageState.messages,
								unreadCount: selectedConversation.unreadCount,
								currentUserId: currentUser.id,
								participants: selectedConversation.participants,
								isGroup: selectedConversation.isGroup,
								themeColor: selectedConversation.themeColor,
								areReceiptsShared: currentUser.readReceiptsEnabled,
								isLoadingThread: messageState.isLoadingThread,
								hasMoreOlder: messageState.hasMoreOlder,
								isLoadingOlder: messageState.isLoadingOlder,
								onLoadOlder: messageState.loadOlder,
								hasMoreNewer: messageState.hasMoreNewer,
								isLoadingNewer: messageState.isLoadingNewer,
								onLoadNewer: messageState.loadNewer,
								onEditMessage: messageState.editMessage,
								onDeleteMessage: messageState.deleteMessage,
								onHideMessage: messageState.hideMessage,
								onRetrySend: messageState.retrySend,
								onDiscardDraft: messageState.discardDraft,
								onToggleReaction: messageState.toggleReaction,
								onReplyToMessage: setReplyTo,
								onForwardMessage: setForwardingMessage,
								onTogglePinMessage,
								pinnedMessageIds,
								onJumpToMessage: jumpToMessage,
								onTrimHistory: messageState.trimHistory,
								requestEditLast: editLastRequest,
								requestCancelEdit: cancelEditRequest,
								onEditingStateChange: setIsEditingMessage,
								targetMessageId: messageState.targetMessageId,
								onReturnToLatest: closeMessageSearch,
							}}
							messageInputProps={{
								isGroup: selectedConversation.isGroup,
								conversationId: selectedConversation.id,
								participants: selectedConversation.participants,
								currentUserId: currentUser.id,
								replyTo,
								onCancelReply: () => setReplyTo(null),
								onSend: messageState.sendMessage,
								onSendSticker: messageState.sendSticker,
								onSendFile: messageState.sendFile,
								onSendVoice: messageState.sendVoice,
								onRestoreReply: requestReplyTo,
							}}
						/>
					) : (
						<ChatWelcome
							unreadCount={getTotalUnreadCount(conversations)}
							isConnectionLost={isConnectionLost}
							onOpenUnread={
								findFirstUnreadConversation(conversations) ? openFirstUnreadConversation : undefined
							}
						/>
					)}
				</main>
			</div>
		</div>
	);
}
