import { GlobalMessageSearch } from "../components/global-message-search";
import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback, useRef, useState } from "react";
import { useGlobalSearchSession } from "../hooks/use-global-search-session";
import { useConversationRoute } from "../hooks/use-conversation-route";
import { useChatLayers } from "../hooks/use-chat-layers";
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

	const [openedSavedConversation, setOpenedSavedConversation] = useState<ConversationDTO | null>(null);
	const [requestedMessageId, setRequestedMessageId] = useState<string | null>(null);
	const [isEditingMessage, setIsEditingMessage] = useState(false);
	const [editLastRequest, setEditLastRequest] = useState(0);
	const [cancelEditRequest, setCancelEditRequest] = useState(0);
	const globalSearch = useGlobalSearchSession();
	const selectConversationRef = useRef<(conversationId: string | null) => void>(() => undefined);
	const handleUnavailableMessageNavigation = useCallback(() => setRequestedMessageId(null), []);

	const refreshBlockedUsers = useBlockedUsersSync();
	const refreshRestrictedUsers = useRestrictedUsersSync();
	const onlineUserIds = usePresence();

	const {
		conversations,
		refresh: refreshConversations,
		paging: conversationPaging,
		isShowingArchived,
		setIsShowingArchived,
	} = useConversationList(
		currentUser?.id,
		useCallback((conversationId: string) => {
			if (window.location.pathname === `/chat/${encodeURIComponent(conversationId)}`)
				selectConversationRef.current(null);
		}, []),
	);
	const { selectedConversationId, selectConversation, leaveConversation, isUnavailable } = useConversationRoute({
		conversations,
		isListLoading: conversationPaging.isLoading,
		openedConversation: openedSavedConversation,
		setOpenedConversation: setOpenedSavedConversation,
	});
	const layers = useChatLayers({
		selectedConversationId,
		isGlobalSearchOpen: globalSearch.isOpen,
		closeGlobalSearch: globalSearch.close,
		clearRequestedMessage: handleUnavailableMessageNavigation,
	});
	selectConversationRef.current = selectConversation;
	const { activeUserIds: typingUserIds, typingByConversation } = useTypingParticipants(selectedConversationId);

	useDocumentTitle(conversations);
	useMessageSound(currentUser?.id ?? "", conversations, selectedConversationId);
	useOutboxReplay({ userId: currentUser?.id, activeConversationId: selectedConversationId });

	const messageState = useConversationMessages(
		selectedConversationId,
		refreshConversations,
		requestedMessageId,
		handleUnavailableMessageNavigation,
	);
	const { replyTo, pendingReplyId, replyError, setReplyTo, requestReplyTo, clearReply } = useReplyTarget(
		messageState.messages,
		selectedConversationId,
	);

	useKeyboardShortcuts({
		hasOpenPanel: layers.hasOpenPanel,
		onClosePanel: () => {
			if (globalSearch.isOpen) globalSearch.close();
			else if (layers.isShortcutHelpOpen) layers.setIsShortcutHelpOpen(false);
			else if (layers.forwardingMessage) layers.setForwardingMessage(null);
			else if (layers.isManagingGroup) layers.setIsManagingGroup(false);
			else closeMessageSearch();
		},
		hasReply: Boolean(replyTo || pendingReplyId),
		onCancelReply: clearReply,
		isEditing: isEditingMessage,
		onCancelEdit: () => setCancelEditRequest((current) => current + 1),
		onEditLast: () => setEditLastRequest((current) => current + 1),
		onOpenConversationSearch: () => {
			if (selectedConversationId) layers.setIsConversationSearchOpen(true);
		},
		onShowHelp: () => layers.setIsShortcutHelpOpen(true),
	});

	const isConnectionLost = useSocketConnection(
		useCallback(() => {
			refreshConversations();
			messageState.resync();
			void refreshBlockedUsers();
			void refreshRestrictedUsers();
		}, [messageState.resync, refreshBlockedUsers, refreshConversations, refreshRestrictedUsers]),
	);

	const selectedConversation =
		conversations.find((conversation) => conversation.id === selectedConversationId) ??
		(openedSavedConversation?.id === selectedConversationId ? openedSavedConversation : undefined);

	const { pinnedMessageIds, onTogglePinMessage } = useMessageListHandlers(
		selectedConversationId,
		selectedConversation?.pinnedMessages,
	);

	const {
		handleConversationStarted,
		openNotificationConversation,
		handleConversationSelected,
		selectSearchResult,
		closeMessageSearch,
		openFirstUnreadConversation,
		jumpToMessage,
	} = useConversationNavigation({
		conversations,
		refreshConversations,
		setSelectedConversationId: selectConversation,
		setOpenedSavedConversation,
		setRequestedMessageId,
		setIsConversationSearchOpen: layers.setIsConversationSearchOpen,
	});
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
			{layers.isShortcutHelpOpen && (
				<KeyboardShortcutsPanel onClose={() => layers.setIsShortcutHelpOpen(false)} />
			)}
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
					data-conversation-id={selectedConversation?.id}
					className={cn("relative min-w-0 flex-1 flex-col", selectedConversation ? "flex" : "hidden lg:flex")}
				>
					{selectedConversation ? (
						<ChatConversationPane
							conversation={selectedConversation}
							currentUserId={currentUser.id}
							onlineUserIds={onlineUserIds}
							typingUserIds={typingUserIds}
							isManagingDetails={layers.isManagingGroup}
							onToggleDetails={() => layers.setIsManagingGroup((current) => !current)}
							onBack={() => {
								setReplyTo(null);
								leaveConversation();
							}}
							isSearchOpen={layers.isConversationSearchOpen}
							onOpenSearch={() => {
								setRequestedMessageId(null);
								layers.setIsConversationSearchOpen(true);
							}}
							onCloseSearch={closeMessageSearch}
							onSelectSearchResult={selectSearchResult}
							onClearSearchResult={() => setRequestedMessageId(null)}
							forwardingMessage={layers.forwardingMessage}
							onCloseForward={() => layers.setForwardingMessage(null)}
							onOpenMessage={(messageId) => {
								jumpToMessage(messageId);
								layers.setIsManagingGroup(false);
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
								onForwardMessage: layers.setForwardingMessage,
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
								pendingReplyId,
								replyError,
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
							isUnavailable={isUnavailable}
							hasNoConversations={
								!isShowingArchived &&
								!conversationPaging.isLoading &&
								!conversationPaging.error &&
								conversations.length === 0
							}
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
