import type { ConversationDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { EMPTY_CONVERSATION_TEXT } from "../constants/message";
import { formatRelativeTime, getConversationPreview, getConversationTitle, isConversationMuted } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";
import { useInfiniteScroll } from "../hooks/use-infinite-scroll";
import type { ConversationPaging } from "../types/conversation-paging";
import { ConversationActions } from "./conversation-actions";
import { TypingDots } from "./typing-dots";
import { useDraftPreviews } from "../hooks/use-draft-previews";

interface ConversationListProps {
	conversations: ConversationDTO[];
	currentUserId: string;
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	typingByConversation: Record<string, string[]>;
	paging: ConversationPaging;
}

export function ConversationList({
	conversations,
	currentUserId,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	typingByConversation,
	paging,
}: ConversationListProps) {
	const loadMoreRef = useInfiniteScroll<HTMLLIElement>(paging.hasMore, paging.isLoadingMore, paging.loadMore);
	const draftPreviews = useDraftPreviews(conversations.map((conversation) => conversation.id));

	if (conversations.length === 0) {
		return (
			<p className="px-5 py-6 text-[13px] text-ink-faint">
				No conversations yet. Find someone above to start one.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-0.5 px-2 pb-2">
			{conversations.map((conversation) => {
				const hasUnread = conversation.unreadCount > 0;
				const isSelected = conversation.id === selectedConversationId;
				const lastMessage = conversation.lastMessage;
				const isLastMessageMine = lastMessage?.author?.id === currentUserId;
				const draftPreview = draftPreviews[conversation.id];
				const hasDraft = Boolean(draftPreview);
				// Only in groups, and only in mono: it is a handle, not a name.
				const authorHandle =
					conversation.isGroup && lastMessage?.kind === "user" ? (lastMessage.author?.handle ?? null) : null;
				const isSomeoneTyping =
					!hasDraft &&
					(typingByConversation[conversation.id] ?? []).some((userId) => userId !== currentUserId);
				const isMentioned = Boolean(lastMessage?.mentionedUserIds.includes(currentUserId) && hasUnread);
				const isMuted = isConversationMuted(conversation);

				return (
					<li key={conversation.id} className="group relative">
						<Button
							variant="ghost"
							onClick={() => onSelect(conversation.id)}
							aria-current={isSelected ? "page" : undefined}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							className={cn(
								"relative w-full items-center justify-start gap-3 rounded-panel px-3 py-3 text-left font-normal",
								isSelected
									? "bg-paper-sunken hover:bg-paper-sunken"
									: isMentioned
										? "bg-signal-soft hover:bg-signal-soft"
										: "hover:bg-transparent",
							)}
						>
							<ConversationAvatar
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={onlineUserIds}
							/>

							<span className="flex min-w-0 flex-1 flex-col">
								<span className="flex min-w-0 items-baseline gap-3 pr-14">
									<span
										className={cn(
											"min-w-0 truncate text-[14px] leading-5 text-ink",
											hasUnread ? "font-semibold" : "font-medium",
										)}
									>
										{getConversationTitle(conversation, currentUserId)}
									</span>
								</span>
								<span
									className={cn("flex min-w-0 items-center gap-2", isMuted && !hasUnread && "pr-8")}
								>
									<span className="flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-5">
										{hasDraft && <span className="shrink-0 font-medium text-signal">Draft:</span>}
										{isLastMessageMine && !isSomeoneTyping && !hasDraft && (
											<span className="shrink-0 text-ink-soft">You:</span>
										)}
										{authorHandle && !isLastMessageMine && !isSomeoneTyping && !hasDraft && (
											<span className="max-w-[35%] truncate text-ink-soft">{authorHandle}:</span>
										)}
										<span
											className={cn(
												"min-w-0 truncate",
												hasUnread && !hasDraft && !isSomeoneTyping
													? "font-medium text-ink"
													: "text-ink-soft",
											)}
										>
											{hasDraft
												? draftPreview
												: isSomeoneTyping
													? "Typing"
													: lastMessage
														? getConversationPreview(lastMessage)
														: EMPTY_CONVERSATION_TEXT}
										</span>
										{isSomeoneTyping && (
											<span className="flex self-center">
												<TypingDots />
											</span>
										)}
										{lastMessage && !hasDraft && !isSomeoneTyping && (
											<span className="shrink-0 text-ink-faint">
												· {formatRelativeTime(conversation.updatedAt)}
											</span>
										)}
									</span>
									{hasUnread && (
										<span
											aria-label={`${conversation.unreadCount} unread messages${isMentioned ? ", including a mention" : ""}`}
											className="meta flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-signal px-1.5 font-semibold text-paper-raised"
										>
											{isMentioned
												? "@"
												: conversation.unreadCount > MAX_UNREAD_BADGE_COUNT
													? `${MAX_UNREAD_BADGE_COUNT}+`
													: conversation.unreadCount}
										</span>
									)}
								</span>
							</span>
						</Button>
						<ConversationActions conversation={conversation} currentUserId={currentUserId} />
					</li>
				);
			})}

			{/* The sentinel sits inside the list rather than after it, so the
			    sidebar's own scroll container is what it is measured against. */}
			{paging.hasMore && (
				<li ref={loadMoreRef} aria-hidden="true" className="py-3 text-center">
					<span className="meta text-ink-faint">{paging.isLoadingMore ? "Loading…" : ""}</span>
				</li>
			)}
		</ul>
	);
}
