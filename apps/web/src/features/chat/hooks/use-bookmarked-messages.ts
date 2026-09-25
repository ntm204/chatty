import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import { api } from "@/api/client";
import { useSocketEvent } from "./use-socket-event";

export function useBookmarkedMessages(currentUserId: string) {
	const [results, setResults] = useState<MessageSearchResultDTO[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [removingId, setRemovingId] = useState<string | null>(null);
	const removingRef = useRef<object | null>(null);
	const accountScopeRef = useRef({ currentUserId });
	if (accountScopeRef.current.currentUserId !== currentUserId) accountScopeRef.current = { currentUserId };
	const isMountedRef = useRef(true);
	const generationRef = useRef(0);
	const pendingRef = useRef<number | null>(null);
	const resultsRef = useRef(results);
	resultsRef.current = results;

	const load = useCallback(async (generation: number, before?: string, retainCount = 0) => {
		if (pendingRef.current === generation) return;
		pendingRef.current = generation;
		setIsLoading(true);
		setError("");
		try {
			const page = await api.listBookmarkedMessages(before);
			if (generation !== generationRef.current) return;
			while (!before && page.hasMore && page.results.length < retainCount) {
				const cursor = page.results.at(-1)?.message.id;
				if (!cursor) break;
				const next = await api.listBookmarkedMessages(cursor);
				if (generation !== generationRef.current) return;
				const added = next.results.filter(
					(row) => !page.results.some((existing) => existing.message.id === row.message.id),
				);
				page.results.push(...added);
				page.hasMore = next.hasMore;
				if (!added.length) break;
			}
			setResults((current) =>
				before
					? [
							...current,
							...page.results.filter(
								(result) => !current.some((row) => row.message.id === result.message.id),
							),
						]
					: page.results,
			);
			setHasMore(page.hasMore);
		} catch (caught) {
			if (generation === generationRef.current)
				setError(caught instanceof Error ? caught.message : "Could not load bookmarks");
		} finally {
			if (generation === generationRef.current) setIsLoading(false);
			if (pendingRef.current === generation) pendingRef.current = null;
		}
	}, []);
	const reload = useCallback(() => {
		const generation = ++generationRef.current;
		setResults([]);
		setHasMore(false);
		void load(generation);
	}, [load]);
	const refresh = useCallback(() => {
		void load(++generationRef.current, undefined, resultsRef.current.length);
	}, [load]);
	useEffect(() => {
		isMountedRef.current = true;
		setRemovingId(null);
		reload();

		return () => {
			isMountedRef.current = false;
			removingRef.current = null;
			generationRef.current++;
		};
	}, [reload, currentUserId]);
	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (
					message.deletedAt ||
					resultsRef.current.some(
						(row) => row.message.id === message.id || row.message.replyTo?.id === message.id,
					)
				) {
					if (message.deletedAt)
						setResults((current) =>
							current.filter(
								(row) => row.message.id !== message.id && row.message.replyTo?.id !== message.id,
							),
						);
					refresh();
				}
			},
			[refresh],
		),
	);
	useSocketEvent("message:hidden", (event) => {
		setResults((current) =>
			current.filter((row) => row.message.id !== event.messageId && row.message.replyTo?.id !== event.messageId),
		);
		refresh();
	});
	useSocketEvent("conversation:left", reload);
	useSocketEvent("bookmark:changed", refresh);

	async function remove(result: MessageSearchResultDTO) {
		if (removingRef.current) return;
		const accountScope = accountScopeRef.current;
		const removal = {};
		removingRef.current = removal;
		setRemovingId(result.message.id);
		setError("");
		try {
			await api.removeBookmark(result.conversation.id, result.message.id);
			// A socket refresh can finish before this deletion commits. Confirmed
			// removal must supersede that page without affecting another account.
			if (isMountedRef.current && accountScope === accountScopeRef.current && removingRef.current === removal)
				refresh();
		} catch (caught) {
			if (isMountedRef.current && accountScope === accountScopeRef.current && removingRef.current === removal)
				setError(caught instanceof Error ? caught.message : "Could not remove bookmark");
		} finally {
			if (removingRef.current === removal) {
				removingRef.current = null;
				if (isMountedRef.current && accountScope === accountScopeRef.current) setRemovingId(null);
			}
		}
	}

	return {
		results,
		hasMore,
		isLoading,
		error,
		removingId,
		remove,
		reload,
		loadMore: () => {
			if (!isLoading && hasMore) void load(generationRef.current, results.at(-1)?.message.id);
		},
	};
}
