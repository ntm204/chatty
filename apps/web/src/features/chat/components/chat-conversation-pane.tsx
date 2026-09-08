import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import type { MessageSearchSession } from "../types/message-search";
import { getDirectPeer, getTypingMessage } from "../utils";
import { ConversationHeader } from "./conversation-header";
import { ConversationMessageSearch } from "./conversation-message-search";
import { ConversationVaultPanel } from "./conversation-vault-panel";
import { ForwardMessagePanel } from "./forward-message-panel";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { PinnedMessagesBanner } from "./pinned-messages-banner";
import { ThreadLoadError } from "./thread-load-error";

interface ChatConversationPaneProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	typingUserIds: string[];
	isManagingDetails: boolean;
	onToggleDetails: () => void;
	onBack: () => void;
	isSearchOpen: boolean;
	onOpenSearch: () => void;
	onCloseSearch: () => void;
	onSelectSearchResult: (session: MessageSearchSession) => void;
	onClearSearchResult: () => void;
	forwardingMessage: MessageDTO | null;
	conversations: ConversationDTO[];
	onCloseForward: () => void;
	onOpenMessage: (messageId: string) => void;
	loadError: string;
	onRetryLoad: () => void;
	messageListProps: ComponentProps<typeof MessageList>;
	messageInputProps: ComponentProps<typeof MessageInput>;
}

export function ChatConversationPane({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	isManagingDetails,
	onToggleDetails,
	onBack,
	isSearchOpen,
	onOpenSearch,
	onCloseSearch,
	onSelectSearchResult,
	onClearSearchResult,
	forwardingMessage,
	conversations,
	onCloseForward,
	onOpenMessage,
	loadError,
	onRetryLoad,
	messageListProps,
	messageInputProps,
}: ChatConversationPaneProps) {
	const pendingDetailJumpRef = useRef<{ conversationId: string; messageId: string } | null>(null);
	useEffect(() => {
		const pending = pendingDetailJumpRef.current;
		if (isManagingDetails || !pending) return;
		pendingDetailJumpRef.current = null;
		if (pending.conversationId === conversation.id) onOpenMessage(pending.messageId);
	}, [isManagingDetails, conversation.id, onOpenMessage]);
	const peer = conversation.isGroup ? null : getDirectPeer(conversation, currentUserId);
	const isBlocked = useBlockedUsers((state) => Boolean(peer && state.blockedIds.has(peer.id)));
	const loadBlocked = useBlockedUsers((state) => state.load);

	useEffect(() => {
		if (peer) void loadBlocked(peer.id);
	}, [loadBlocked, peer]);

	return (
		<>
			{forwardingMessage && (
				<ForwardMessagePanel
					message={forwardingMessage}
					conversations={conversations}
					currentUserId={currentUserId}
					onClose={onCloseForward}
				/>
			)}
			<div className="flex min-h-0 flex-1 xl:gap-2">
				<section
					aria-label="Conversation"
					data-conversation-theme={conversation.themeColor ?? "default"}
					className={cn(
						"conversation-pane flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-xl lg:border lg:border-rule",
						isManagingDetails && "max-xl:hidden",
					)}
				>
					<ConversationHeader
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
						typingUserIds={typingUserIds}
						onToggleGroupMembers={onToggleDetails}
						isManagingGroup={isManagingDetails}
						onBack={onBack}
						onOpenMessageSearch={onOpenSearch}
					/>
					<PinnedMessagesBanner
						key={conversation.id}
						pinnedMessages={conversation.pinnedMessages}
						currentUserId={currentUserId}
						onOpenMessage={onOpenMessage}
					/>

					{isSearchOpen && (
						<ConversationMessageSearch
							conversationId={conversation.id}
							onSelectResult={onSelectSearchResult}
							onClearResult={onClearSearchResult}
							onClose={onCloseSearch}
						/>
					)}

					<div className="min-h-0 flex-1">
						{loadError ? (
							<ThreadLoadError message={loadError} onRetry={onRetryLoad} />
						) : (
							<MessageList
								{...messageListProps}
								typingMessage={getTypingMessage(
									typingUserIds.filter((userId) => userId !== currentUserId),
									conversation.participants,
								)}
							/>
						)}
					</div>
					<MessageInput {...messageInputProps} isDisabled={isBlocked} />
				</section>
				{isManagingDetails && (
					<ConversationVaultPanel
						key={conversation.id}
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
						onClose={onToggleDetails}
						onOpenSearch={onOpenSearch}
						onOpenMessage={(messageId) => {
							pendingDetailJumpRef.current = { conversationId: conversation.id, messageId };
							if (isManagingDetails) onToggleDetails();
						}}
					/>
				)}
			</div>
		</>
	);
}
