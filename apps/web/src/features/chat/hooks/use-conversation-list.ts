import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { cacheConversationPage, readConversationPage } from "@/lib/local-chat-store";
import type { ConversationPaging } from "../types/conversation-paging";
import { usePresenceLastSeenSync } from "./use-presence-last-seen-sync";
import { useRestrictedUnreadSync } from "./use-restricted-unread-sync";
import { useConversationListEvents } from "./use-conversation-list-events";

interface ConversationList {
	conversations: ConversationDTO[];
	/** Re-fetches the first page. The sidebar's ordering and previews come from it. */
	refresh: () => void;
	/** Everything the sidebar needs to page, in one object so it travels as one prop. */
	paging: ConversationPaging;
	isShowingArchived: boolean;
	setIsShowingArchived: (isShowing: boolean) => void;
}

/**
 * The sidebar's list, and the events that keep it true (in `useConversationListEvents`).
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
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const requestRef = useRef(0);
	const serverPageRef = useRef(0);
	const pageRequestRef = useRef<object | null>(null);
	const failedPageRef = useRef(false);
	const [loadedCacheScope, setLoadedCacheScope] = useState<string | null>(null);
	const cacheScope = currentUserId ? `${currentUserId}:${isShowingArchived ? "archived" : "active"}` : null;

	const scopeRef = useRef({ key: cacheScope });
	if (scopeRef.current.key !== cacheScope) scopeRef.current = { key: cacheScope };
	const pendingRowsRef = useRef(new Map<string, object>());

	usePresenceLastSeenSync(setConversations);
	useRestrictedUnreadSync(currentUserId, conversations, setConversations);

	const refresh = useCallback(() => {
		if (!currentUserId) return;
		const scope = scopeRef.current;
		const request = ++requestRef.current;
		pageRequestRef.current = null;
		setIsLoadingMore(false);
		failedPageRef.current = false;
		setIsLoading(true);
		setError("");
		void api
			.listConversations(isShowingArchived)
			.then((page) => {
				if (scopeRef.current !== scope || request !== requestRef.current) return;
				serverPageRef.current += 1;
				setLoadedCacheScope(scope.key);
				setConversations(page.items);
				setHasMore(page.hasMore);
			})
			.catch(() => {
				if (scopeRef.current === scope && request === requestRef.current)
					setError("Could not refresh conversations. Displayed conversations may be out of date.");
			})
			.finally(() => {
				if (scopeRef.current === scope && request === requestRef.current) setIsLoading(false);
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
		setIsLoading(true);
		setError("");
		setIsLoadingMore(false);
		setConversations([]);
		setHasMore(false);
		setLoadedCacheScope(null);
		const serverPage = serverPageRef.current;
		// Local storage must not delay the network or replace a fresher server page.
		refresh();
		void readConversationPage(currentUserId, isShowingArchived)
			.then((cached) => {
				if (!isCurrent || !cached || serverPageRef.current !== serverPage) return;
				setConversations(cached.items);
				setHasMore(cached.hasMore);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!isCurrent) return;
				setLoadedCacheScope(cacheScope);
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
		let cursor: ConversationDTO | undefined;
		for (let index = conversations.length - 1; index >= 0; index--) {
			if (!conversations[index]?.isPinned) {
				cursor = conversations[index];
				break;
			}
		}
		if (!cursor || !hasMore || isLoading || pageRequestRef.current) return;

		const scope = scopeRef.current;
		const request = requestRef.current;
		const pageRequest = {};
		pageRequestRef.current = pageRequest;
		setIsLoadingMore(true);
		setError("");
		void api
			.listConversations(isShowingArchived, cursor.id)
			.then((page) => {
				if (scopeRef.current !== scope || request !== requestRef.current) return;
				setConversations((current) => {
					// De-duplicated by id rather than trusted: while this request was in
					// flight a message could have moved one of these rows to the top,
					// and appending it again would show it twice.
					const held = new Set(current.map((conversation) => conversation.id));

					return [...current, ...page.items.filter((conversation) => !held.has(conversation.id))];
				});
				setHasMore(page.hasMore);
				failedPageRef.current = false;
			})
			.catch(() => {
				if (scopeRef.current !== scope || request !== requestRef.current) return;
				failedPageRef.current = true;
				setError("Could not load more conversations. Try again.");
			})
			.finally(() => {
				if (pageRequestRef.current !== pageRequest) return;
				pageRequestRef.current = null;
				if (scopeRef.current === scope && request === requestRef.current) setIsLoadingMore(false);
			});
	}, [conversations, hasMore, isLoading, isShowingArchived]);

	useConversationListEvents({
		currentUserId,
		isShowingArchived,
		setConversations,
		scopeRef,
		pendingRowsRef,
		refresh,
		onConversationLeft,
	});

	return {
		conversations: loadedCacheScope === cacheScope ? conversations : [],
		refresh,
		paging: {
			hasMore,
			isLoadingMore,
			loadMore,
			isLoading,
			error,
			retry: () => (failedPageRef.current ? loadMore() : refresh()),
		},
		isShowingArchived,
		setIsShowingArchived,
	} satisfies ConversationList;
}
