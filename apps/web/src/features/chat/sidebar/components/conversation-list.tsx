import type { ConversationDTO } from "@chatty/shared-types";
import { BellOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { EMPTY_CONVERSATION_TEXT } from "../../constants/message";
import { getConversationPreview, getConversationTitle, isConversationMuted } from "../../utils";
import { ConversationAvatar } from "../../components/conversation-avatar";
import { useInfiniteScroll } from "../../hooks/use-infinite-scroll";
import type { ConversationPaging } from "../../types/conversation-paging";
import { ConversationActions } from "./conversation-actions";
import { ConversationRowMeta } from "./conversation-row-meta";
import { useAuth } from "@/hooks/use-auth";
import { ConversationPreview } from "./conversation-preview";
import { useLongPress } from "../hooks/use-long-press";
import { TypingDots } from "../../components/typing-dots";
import { useDraftPreviews } from "../hooks/use-draft-previews";
import { useMuteExpiry } from "../../hooks/use-mute-expiry";
import { EmptyState } from "@/components/empty-state";
import { SkeletonList } from "@/components/skeleton";
import type { ConversationListEmptyState, ConversationPreviewTarget } from "../types/conversation-list";

interface ConversationListProps {
	conversations: ConversationDTO[];
	currentUserId: string;
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	typingByConversation: Record<string, string[]>;
	paging: ConversationPaging;
	/** Said instead of "No conversations yet" when a folder filters everything out. */
	/** Why the list is empty when that is not a first visit: a filter, or the archive. */
	emptyState?: ConversationListEmptyState;
}

export function ConversationList({
	conversations,
	currentUserId,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	typingByConversation,
	paging,
	emptyState,
}: ConversationListProps) {
	useMuteExpiry(conversations.map((conversation) => conversation.mutedUntil));
	const areReceiptsShared = useAuth((state) => state.currentUser?.readReceiptsEnabled ?? false);
	const loadMoreRef = useInfiniteScroll<HTMLLIElement>(
		paging.hasMore && !paging.error,
		paging.isLoadingMore,
		paging.loadMore,
	);
	const draftPreviews = useDraftPreviews(
		currentUserId,
		conversations.map((conversation) => conversation.id),
	);
	const [preview, setPreview] = useState<ConversationPreviewTarget | null>(null);
	// Live from the list, so a message arriving while previewing shows up in it.
	const previewed = preview && conversations.find((conversation) => conversation.id === preview.conversationId);

	function openPreview(conversationId: string, row: Element, variant: ConversationPreviewTarget["variant"]) {
		const sidebar = row.closest("aside")?.getBoundingClientRect();
		const anchor = row.getBoundingClientRect();
		setPreview({ conversationId, variant, anchor, sidebarRight: sidebar?.right ?? anchor.right });
	}
	// Touch: hold a row to read it without opening it — the phone's gesture for this.
	const longPress = useLongPress((element) => {
		const conversationId = element.dataset.conversationId;
		if (conversationId) openPreview(conversationId, element, "sheet");
	});

	if (conversations.length === 0) {
		if (paging.error) {
			return (
				<div className="px-5 py-6 text-[13px] text-ink-faint">
					<p role="alert">{paging.error}</p>
					<Button variant="ghost" onClick={paging.retry}>
						Retry conversations
					</Button>
				</div>
			);
		}
		if (paging.isLoading) return <SkeletonList label="Loading conversations" />;

		// A filter that matches nothing is not a first visit: say which, and only
		// a first visit offers the way to start.
		return emptyState ? (
			<EmptyState title={emptyState.title} description={emptyState.description} />
		) : (
			<EmptyState
				title="No conversations yet"
				description="Find someone by name or @handle to start one."
				action={
					<Button
						variant="outline"
						onClick={() => document.getElementById("global-conversation-search")?.focus()}
					>
						Find someone
					</Button>
				}
			/>
		);
	}

	return (
		<ul className="conversation-list flex flex-col gap-0.5 px-2 pt-2 pb-3">
			{paging.error && (
				<li className="p-3 text-sm text-signal">
					<p role="alert">{paging.error}</p>
					<Button variant="ghost" onClick={paging.retry}>
						Retry conversations
					</Button>
				</li>
			)}
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
				// Two ticks once anyone else's shared read marker reaches your last message — and only
				// while you share your own, the same exchange the thread's "Seen" follows.
				const isLastMessageRead =
					areReceiptsShared &&
					isLastMessageMine &&
					conversation.participants.some(
						(participant) =>
							participant.id !== currentUserId && participant.lastReadMessageId === lastMessage?.id,
					);

				return (
					<li key={conversation.id} className="conversation-row-item group relative">
						<Button
							variant="ghost"
							data-conversation-id={conversation.id}
							{...longPress.handlers}
							onClick={() => {
								if (!longPress.shouldSuppressClick()) onSelect(conversation.id);
							}}
							// Desktop: right-click a row to read it without opening it.
							onContextMenu={(event) => {
								longPress.handlers.onContextMenu(event);
								// On touch, a long press already opened the sheet.
								if (window.matchMedia?.("(hover: none)").matches) return;
								event.preventDefault();
								openPreview(conversation.id, event.currentTarget, "popover");
							}}
							aria-current={isSelected ? "page" : undefined}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							className={cn(
								"conversation-row relative w-full items-center justify-start gap-3 px-2.5 py-2 text-left font-normal",
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
								<span className="flex min-w-0 items-center gap-1.5">
									<span
										title={getConversationTitle(conversation, currentUserId)}
										className={cn(
											"font-content min-w-0 truncate text-[14px] leading-5 text-ink",
											hasUnread ? "font-semibold" : "font-medium",
										)}
									>
										{getConversationTitle(conversation, currentUserId)}
									</span>
									{/* Telegram's place for it: beside the name, where it qualifies the chat. */}
									{isMuted && (
										<BellOff
											role="img"
											aria-label="Muted"
											className="size-3.5 shrink-0 self-center text-ink-faint"
										/>
									)}
								</span>
								<span className="flex min-w-0 items-center gap-2">
									<span className="font-content flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-5">
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
									</span>
								</span>
							</span>
							<ConversationRowMeta
								updatedAt={lastMessage ? conversation.updatedAt : null}
								unreadCount={conversation.unreadCount}
								isMuted={isMuted}
								isMentioned={isMentioned}
								isPinned={conversation.isPinned}
								tick={isLastMessageMine && !hasDraft ? (isLastMessageRead ? "read" : "sent") : null}
							/>
						</Button>
						<ConversationActions
							conversation={conversation}
							currentUserId={currentUserId}
							onPreview={(row) =>
								openPreview(
									conversation.id,
									row,
									window.matchMedia?.("(hover: none)").matches ? "sheet" : "popover",
								)
							}
						/>
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
			{previewed && preview && (
				<ConversationPreview
					conversation={previewed}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					variant={preview.variant}
					anchor={preview.anchor}
					sidebarRight={preview.sidebarRight}
					onOpen={() => {
						setPreview(null);
						onSelect(previewed.id);
					}}
					onClose={() => setPreview(null)}
				/>
			)}
		</ul>
	);
}
