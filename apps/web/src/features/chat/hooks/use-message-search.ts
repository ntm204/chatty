import type { MessageDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { applyMessageUpdate } from "@/utils/apply-message-update";
import { MESSAGE_SEARCH_DEBOUNCE_MS, MESSAGE_SEARCH_MIN_LENGTH } from "../constants/search";
import { useSocketEvent } from "./use-socket-event";

interface MessageSearch {
	query: string;
	setQuery: (query: string) => void;
	results: MessageSearchResultDTO[];
	isSearching: boolean;
	error: string;
	hasNoResults: boolean;
	hasMore: boolean;
	isLoadingMore: boolean;
	loadMore: () => void;
	retry: () => void;
}

/** One request generation owns both the first page and every subsequent cursor. */
export function useMessageSearch(conversationId?: string): MessageSearch {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<MessageSearchResultDTO[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState("");
	const [hasSearched, setHasSearched] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const generationRef = useRef(0);
	const loadingMoreRef = useRef(false);
	const updatesRef = useRef(new Map<string, MessageDTO>());
	const hiddenRef = useRef(new Set<string>());
	const cursorRef = useRef<MessageDTO | null>(null);

	function reconcile(found: MessageSearchResultDTO[]) {
		return found.flatMap((result) => {
			const update = updatesRef.current.get(result.message.id);
			if (update?.deletedAt || hiddenRef.current.has(result.message.id)) return [];
			let message = update ?? result.message;
			const parentUpdate = message.replyTo ? updatesRef.current.get(message.replyTo.id) : undefined;
			if (parentUpdate) message = applyMessageUpdate(message, parentUpdate);

			return [{ ...result, message }];
		});
	}

	useEffect(() => {
		const generation = ++generationRef.current;
		const trimmed = query.trim();
		updatesRef.current.clear();
		hiddenRef.current.clear();
		cursorRef.current = null;
		loadingMoreRef.current = false;
		setResults([]);
		setHasMore(false);
		setHasSearched(false);
		setError("");
		setIsLoadingMore(false);
		setIsSearching(trimmed.length >= MESSAGE_SEARCH_MIN_LENGTH);
		if (trimmed.length < MESSAGE_SEARCH_MIN_LENGTH) return;
		if (!navigator.onLine) {
			setIsSearching(false);
			setError("Connect to search messages. Offline history is not searched.");

			return;
		}
		const timer = setTimeout(() => {
			void api
				.searchMessages(trimmed, 20, conversationId)
				.then((page) => {
					if (generation !== generationRef.current) return;
					cursorRef.current = page.results.at(-1)?.message ?? null;
					setResults(reconcile(page.results));
					setHasMore(page.hasMore);
					setHasSearched(true);
				})
				.catch((caught: Error) => {
					if (generation === generationRef.current) setError(caught.message);
				})
				.finally(() => {
					if (generation === generationRef.current) setIsSearching(false);
				});
		}, MESSAGE_SEARCH_DEBOUNCE_MS);

		return () => {
			generationRef.current += 1;
			clearTimeout(timer);
		};
	}, [query, conversationId, retryCount]);

	function loadMore() {
		const oldest = cursorRef.current;
		if (!oldest || !hasMore || isSearching || loadingMoreRef.current) return;
		const generation = generationRef.current;
		loadingMoreRef.current = true;
		setIsLoadingMore(true);
		setError("");
		void api
			.searchMessages(query.trim(), 20, conversationId, oldest.createdAt, oldest.id)
			.then((page) => {
				if (generation !== generationRef.current) return;
				cursorRef.current = page.results.at(-1)?.message ?? null;
				const added = reconcile(page.results);
				setResults((current) => {
					const known = new Set(current.map((result) => result.message.id));

					return [...current, ...added.filter((result) => !known.has(result.message.id))];
				});
				setHasMore(page.hasMore);
			})
			.catch((caught: Error) => {
				if (generation === generationRef.current) setError(caught.message);
			})
			.finally(() => {
				if (generation !== generationRef.current) return;
				loadingMoreRef.current = false;
				setIsLoadingMore(false);
			});
	}

	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (
					query.trim().length < MESSAGE_SEARCH_MIN_LENGTH ||
					(conversationId && message.conversationId !== conversationId)
				) {
					return;
				}
				updatesRef.current.set(message.id, message);
				setResults((current) =>
					current
						.filter((result) => result.message.id !== message.id || !message.deletedAt)
						.map((result) => ({ ...result, message: applyMessageUpdate(result.message, message) })),
				);
			},
			[conversationId, query],
		),
	);
	useSocketEvent(
		"message:hidden",
		useCallback(
			(event: { conversationId: string; messageId: string }) => {
				if (
					query.trim().length < MESSAGE_SEARCH_MIN_LENGTH ||
					(conversationId && event.conversationId !== conversationId)
				) {
					return;
				}
				hiddenRef.current.add(event.messageId);
				setResults((current) => current.filter((result) => result.message.id !== event.messageId));
			},
			[conversationId, query],
		),
	);

	return {
		query,
		setQuery,
		results,
		isSearching,
		error,
		hasNoResults: hasSearched && results.length === 0 && !error,
		hasMore,
		isLoadingMore,
		loadMore,
		retry: () => setRetryCount((current) => current + 1),
	};
}
