import { retractCachedMessage } from "@/lib/local-chat-store";
import type {
	ConversationDTO,
	ConversationLeftEvent,
	ConversationReadEvent,
	ConversationSelfUpdatedEvent,
	ConversationUpdatedEvent,
	MessageDTO,
	PinnedMessageDTO,
} from "@chatty/shared-types";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { api } from "@/api/client";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { useSocketEvent } from "./use-socket-event";

interface ConversationListEventsOptions {
	currentUserId: string | undefined;
	isShowingArchived: boolean;
	setConversations: Dispatch<SetStateAction<ConversationDTO[]>>;
	scopeRef: MutableRefObject<{ key: string | null }>;
	pendingRowsRef: MutableRefObject<Map<string, object>>;
	refresh: () => void;
	onConversationLeft: (conversationId: string) => void;
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
 * The socket events that keep the sidebar's rows true: arrivals, reads, edits,
 * membership and per-user changes. Part of `useConversationList`, which owns
 * the array these handlers write.
 */
export function useConversationListEvents({
	currentUserId,
	isShowingArchived,
	setConversations,
	scopeRef,
	pendingRowsRef,
	refresh,
	onConversationLeft,
}: ConversationListEventsOptions): void {
	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				const scope = scopeRef.current;
				setConversations((current) => {
					// A conversation the sidebar has not paged to yet. Before paging this
					// could not happen — the list held everything — and re-listing to
					// find it would throw away the reader's scroll position, which is the
					// objection that kept item 80 shut. Fetch the one row instead and put
					// it where the activity says it belongs.
					if (!current.some((conversation) => conversation.id === message.conversationId)) {
						if (pendingRowsRef.current.get(message.conversationId) === scope) return current;
						pendingRowsRef.current.set(message.conversationId, scope);
						void api
							.getConversation(message.conversationId)
							.then((row) => {
								if (scopeRef.current !== scope || row.isArchived !== isShowingArchived) return;
								setConversations((latest) =>
									latest.some((conversation) => conversation.id === row.id)
										? latest
										: orderConversationRows([row, ...latest]),
								);
							})
							.catch(() => undefined)
							.finally(() => {
								if (pendingRowsRef.current.get(message.conversationId) === scope)
									pendingRowsRef.current.delete(message.conversationId);
							});

						return current;
					}

					const next = current.map((conversation) => {
						if (conversation.id !== message.conversationId) return conversation;
						const authorId = message.author?.id;
						const restriction = useRestrictedUsers.getState();
						// Same rule as the server's count: a restriction quiets only the DM.
						const isRestrictedDirect =
							!conversation.isGroup && authorId !== undefined && restriction.restrictedIds.has(authorId);
						// Unknown status counts for now; resolving it to "restricted" makes
						// `useRestrictedUnreadSync` re-read the server's figure.
						if (!conversation.isGroup && authorId && !restriction.checkedIds.has(authorId))
							void restriction.load(authorId);
						const shouldRaiseUnread =
							message.kind === "user" && authorId !== currentUserId && !isRestrictedDirect;

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
			[currentUserId, isShowingArchived],
		),
	);

	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (currentUserId && message.deletedAt)
					void retractCachedMessage(currentUserId, message).catch(() => undefined);
				setConversations((current) =>
					current.map((conversation) =>
						conversation.id === message.conversationId
							? {
									...conversation,
									lastMessage:
										conversation.lastMessage?.id === message.id
											? message
											: conversation.lastMessage,
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
			},
			[currentUserId],
		),
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
}
