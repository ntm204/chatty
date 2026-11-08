import type { ConversationDTO } from "@chatty/shared-types";
import { BellOff, Pin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { EMPTY_CONVERSATION_TEXT } from "../constants/message";
import { formatRelativeTime, getConversationPreview, getConversationTitle, isConversationMuted } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";
import { useInfiniteScroll } from "../hooks/use-infinite-scroll";
import type { ConversationPaging } from "../types/conversation-paging";
import { ConversationActions } from "./conversation-actions";
import { ConversationPreview } from "./conversation-preview";
import { useLongPress } from "../hooks/use-long-press";
import type { ConversationPreviewTarget } from "../types/conversation-preview";
import { TypingDots } from "./typing-dots";
import { useDraftPreviews } from "../hooks/use-draft-previews";
import { useMuteExpiry } from "../hooks/use-mute-expiry";

interface ConversationListProps {
	conversations: ConversationDTO[];
	currentUserId: string;
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	typingByConversation: Record<string, string[]>;
	paging: ConversationPaging;
	/** Said instead of "No conversations yet" when a folder filters everything out. */
	emptyMessage?: string;
}

export function ConversationList({
	conversations,
	currentUserId,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	typingByConversation,
	paging,
	emptyMessage,
}: ConversationListProps) {
	useMuteExpiry(conversations.map((conversation) => conversation.mutedUntil));
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
		return (
			<div className="px-5 py-6 text-[13px] text-ink-faint">
				<p role={paging.error ? "alert" : "status"}>
					{paging.error ||
						(paging.isLoading ? "Loading conversations…" : (emptyMessage ?? "No conversations yet."))}
				</p>
				{!paging.error && !paging.isLoading && !emptyMessage && (
					<p className="mt-1 text-xs">Search for someone above to start one.</p>
				)}
				{paging.error && (
					<Button variant="ghost" onClick={paging.retry}>
						Retry conversations
					</Button>
				)}
			</div>
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

				return (
					<li key={conversation.id} className="group relative">
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
								{/* Name left, time right — Telegram's row. The time steps aside
								    for the actions button on hover; on touch, where that button
								    always shows, the line leaves it room instead. */}
								<span className="flex min-w-0 items-baseline gap-2 [@media(hover:none)]:pr-8">
									<span
										title={getConversationTitle(conversation, currentUserId)}
										className={cn(
											"font-content min-w-0 flex-1 truncate text-[14.5px] leading-5 text-ink",
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
									{lastMessage && (
										<span
											className={cn(
												"shrink-0 text-[11.5px] tabular-nums transition-opacity group-hover:opacity-0 group-focus-within:opacity-0",
												hasUnread ? "font-medium text-signal" : "text-ink-faint",
											)}
										>
											{formatRelativeTime(conversation.updatedAt)}
										</span>
									)}
								</span>
								<span className="flex min-w-0 items-center gap-2">
									<span className="font-content flex min-w-0 flex-1 items-center gap-1 text-[13.5px] leading-5">
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
									{/* A pinned chat with nothing new says so where the count would be. */}
									{!hasUnread && conversation.isPinned && (
										<Pin
											role="img"
											aria-label="Pinned"
											className="size-3.5 shrink-0 rotate-45 text-ink-faint"
										/>
									)}
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
