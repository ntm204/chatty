import type {
	ConversationDTO,
	ConversationLeftEvent,
	ConversationReadEvent,
	ConversationSelfUpdatedEvent,
	ConversationUpdatedEvent,
	MessageDTO,
	PinnedMessageDTO,
} from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { cacheConversationPage, readConversationPage } from "@/lib/local-chat-store";
import type { ConversationPaging } from "../types/conversation-paging";
import { usePresenceLastSeenSync } from "./use-presence-last-seen-sync";
import { useSocketEvent } from "./use-socket-event";

interface ConversationList {
	conversations: ConversationDTO[];
	/** Re-fetches the first page. The sidebar's ordering and previews come from it. */
	refresh: () => void;
	/** Everything the sidebar needs to page, in one object so it travels as one prop. */
	paging: ConversationPaging;
	isShowingArchived: boolean;
	setIsShowingArchived: (isShowing: boolean) => void;
}

function orderConversationRows(rows: ConversationDTO[], newlyPinnedId?: string): ConversationDTO[] {
	const pinned = rows.filter((conversation) => conversation.isPinned);
	if (newlyPinnedId) {
		pinned.sort((left, right) => Number(right.id === newlyPinnedId) - Number(left.id === newlyPinnedId));
	}
	const unpinned = rows
		.filter((conversation) => !conversation.isPinned)
		.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

	return [...pinned, ...unpinned];
}

/**
 * The sidebar's list, and the four events that keep it true.
 *
 * Extracted from `ChatPage` for the reason `ConversationSidebar` was: the page
 * was over the 300-line limit, and this is the piece of it that is genuinely one
 * subject. Every one of these handlers writes the same array, and three of them
 * have to agree about what a conversation looks like after somebody else
 * changed it.
 *
 * `currentUserId` is a parameter rather than read from the store, because
 * exactly one handler needs it and passing it keeps this hook a function of its
 * inputs.
 */
export function useConversationList(
	currentUserId: string | undefined,
	onConversationLeft: (conversationId: string) => void,
) {
	const [conversations, setConversations] = useState<ConversationDTO[]>([]);
	const [isShowingArchived, setIsShowingArchived] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [loadedCacheScope, setLoadedCacheScope] = useState<string | null>(null);
	const cacheScope = currentUserId ? `${currentUserId}:${isShowingArchived ? "archived" : "active"}` : null;

	usePresenceLastSeenSync(setConversations);

	const refresh = useCallback(() => {
		if (!currentUserId) return;
		void api
			.listConversations(isShowingArchived)
			.then((page) => {
				setConversations(page.items);
				setHasMore(page.hasMore);
			})
			.catch(() => {
				// An offline refresh keeps the snapshot already on screen. Reconnect is
				// another refresh path, so no timer or request loop is needed here.
			});
	}, [currentUserId, isShowingArchived]);

	useEffect(() => {
		if (!currentUserId || !cacheScope) {
			setConversations([]);
			setHasMore(false);
			setLoadedCacheScope(null);

			return;
		}

		let isCurrent = true;
		setConversations([]);
		setHasMore(false);
		setLoadedCacheScope(null);
		void readConversationPage(currentUserId, isShowingArchived)
			.then((cached) => {
				if (!isCurrent || !cached) return;
				setConversations(cached.items);
				setHasMore(cached.hasMore);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!isCurrent) return;
				setLoadedCacheScope(cacheScope);
				refresh();
			});

		return () => {
			isCurrent = false;
		};
	}, [cacheScope, currentUserId, isShowingArchived, refresh]);

	useEffect(() => {
		if (!currentUserId || loadedCacheScope !== cacheScope) return;
		void cacheConversationPage(currentUserId, isShowingArchived, conversations, hasMore).catch(() => undefined);
	}, [cacheScope, conversations, currentUserId, hasMore, isShowingArchived, loadedCacheScope]);

	/**
	 * The cursor is the last **unpinned** row, because pinned rows are not paged —
	 * they are capped server-side and arrive whole on the first page. Sending a
	 * pinned id would ask the server to continue from a row that is not in the
	 * sequence being walked.
	 */
	const loadMore = useCallback(() => {
		const cursor = [...conversations].reverse().find((conversation) => !conversation.isPinned);
		if (!cursor || isLoadingMore) return;

		setIsLoadingMore(true);
		void api
			.listConversations(isShowingArchived, cursor.id)
			.then((page) => {
				setConversations((current) => {
					// De-duplicated by id rather than trusted: while this request was in
					// flight a message could have moved one of these rows to the top,
					// and appending it again would show it twice.
					const held = new Set(current.map((conversation) => conversation.id));

					return [...current, ...page.items.filter((conversation) => !held.has(conversation.id))];
				});
				setHasMore(page.hasMore);
			})
			.catch(() => {
				// Keep the accumulated local page when pagination loses the network.
			})
			.finally(() => setIsLoadingMore(false));
	}, [conversations, isLoadingMore, isShowingArchived]);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				setConversations((current) => {
					// A conversation the sidebar has not paged to yet. Before paging this
					// could not happen — the list held everything — and re-listing to
					// find it would throw away the reader's scroll position, which is the
					// objection that kept item 80 shut. Fetch the one row instead and put
					// it where the activity says it belongs.
					if (!current.some((conversation) => conversation.id === message.conversationId)) {
						void api
							.getConversation(message.conversationId)
							.then((row) => {
								setConversations((latest) =>
									latest.some((conversation) => conversation.id === row.id)
										? latest
										: orderConversationRows([row, ...latest]),
								);
							})
							.catch(() => undefined);

						return current;
					}

					const next = current.map((conversation) => {
						if (conversation.id !== message.conversationId) return conversation;
						const shouldRaiseUnread = message.kind === "user" && message.author?.id !== currentUserId;

						return {
							...conversation,
							lastMessage: message,
							updatedAt: message.createdAt,
							unreadCount: conversation.unreadCount + (shouldRaiseUnread ? 1 : 0),
						};
					});

					return orderConversationRows(next);
				});
			},
			[currentUserId],
		),
	);

	useSocketEvent(
		"message:updated",
		useCallback((message: MessageDTO) => {
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === message.conversationId
						? {
								...conversation,
								lastMessage:
									conversation.lastMessage?.id === message.id ? message : conversation.lastMessage,
								pinnedMessages: conversation.pinnedMessages
									.filter((pin) => pin.messageId !== message.id || !message.deletedAt)
									.map((pin) =>
										pin.messageId === message.id
											? { ...pin, content: message.content, message }
											: pin,
									),
							}
						: conversation,
				),
			);
		}, []),
	);

	useSocketEvent(
		"message:pins-updated",
		useCallback((event: { conversationId: string; pinnedMessages: PinnedMessageDTO[] }) => {
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === event.conversationId
						? { ...conversation, pinnedMessages: event.pinnedMessages }
						: conversation,
				),
			);
		}, []),
	);

	useSocketEvent(
		"conversation:self-updated",
		useCallback(
			(event: ConversationSelfUpdatedEvent) => {
				setConversations((current) => {
					const target = current.find((conversation) => conversation.id === event.conversationId);
					if (!target) {
						refresh();

						return current;
					}
					if (event.isArchived !== isShowingArchived) {
						return current.filter((conversation) => conversation.id !== event.conversationId);
					}
					const next = current.map((conversation) =>
						conversation.id === event.conversationId
							? {
									...conversation,
									isPinned: event.isPinned,
									isArchived: event.isArchived,
									mutedUntil: event.mutedUntil,
								}
							: conversation,
					);

					return orderConversationRows(next, event.isPinned ? event.conversationId : undefined);
				});
			},
			[isShowingArchived, refresh],
		),
	);

	useSocketEvent(
		"conversation:new",
		useCallback(
			(conversation: ConversationDTO) => {
				// Appears immediately even though it has no messages yet — that is the
				// whole point of the event. De-duplicated by id because the creator
				// also receives it, and they already added it from the HTTP response.
				if (conversation.isArchived !== isShowingArchived) return;
				setConversations((current) =>
					current.some((existing) => existing.id === conversation.id) ? current : [conversation, ...current],
				);
			},
			[isShowingArchived],
		),
	);

	useSocketEvent(
		"conversation:read",
		useCallback(
			(event: ConversationReadEvent) => {
				// Patched in place rather than triggering a refetch: this fires
				// whenever anyone glances at any conversation, and re-listing the
				// sidebar each time would be a request per glance per participant.
				setConversations((current) =>
					current.map((conversation) => {
						if (conversation.id !== event.conversationId) return conversation;

						return {
							...conversation,
							participants: conversation.participants.map((participant) =>
								participant.id === event.userId
									? { ...participant, lastReadMessageId: event.lastReadMessageId }
									: participant,
							),
							// Your own marker moving is the badge clearing — including when
							// it moved on another device, which is the case a refetch-only
							// approach leaves lit until something else happens.
							unreadCount: event.userId === currentUserId ? 0 : conversation.unreadCount,
						};
					}),
				);
			},
			[currentUserId],
		),
	);

	useSocketEvent(
		"conversation:updated",
		useCallback((event: ConversationUpdatedEvent) => {
			// Patched in place, and only the shared fields the event actually carries
			// — `unreadCount` and `lastMessage` are deliberately absent from it
			// (see the type's doc comment), so leaving them untouched here is what
			// keeps them correct rather than overwriting them with nothing.
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === event.conversationId
						? {
								...conversation,
								name: event.name,
								invitePolicy: event.invitePolicy,
								avatarUrl: event.avatarUrl,
								themeColor: event.themeColor,
								quickReactionEmoji: event.quickReactionEmoji,
								participants: event.participants,
							}
						: conversation,
				),
			);
		}, []),
	);

	useSocketEvent(
		"conversation:left",
		useCallback(
			(event: ConversationLeftEvent) => {
				// Fires whether this tab removed itself, another tab of the same
				// session did, or someone else kicked this user — one event for all
				// three, so this is the only place any of them get handled.
				setConversations((current) =>
					current.filter((conversation) => conversation.id !== event.conversationId),
				);
				// The page decides what to do about it: only it knows whether this is
				// the conversation currently on screen.
				onConversationLeft(event.conversationId);
			},
			[onConversationLeft],
		),
	);

	return {
		conversations,
		refresh,
		paging: { hasMore, isLoadingMore, loadMore },
		isShowingArchived,
		setIsShowingArchived,
	} satisfies ConversationList;
}
