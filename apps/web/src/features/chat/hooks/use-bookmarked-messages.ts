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
	const removingRef = useRef<string | null>(null);
	const isMountedRef = useRef(true);
	const generationRef = useRef(0);
	const pendingRef = useRef<number | null>(null);
	const resultsRef = useRef(results);
	resultsRef.current = results;

	const load = useCallback(async (generation: number, before?: string) => {
		if (pendingRef.current === generation) return;
		pendingRef.current = generation;
		setIsLoading(true);
		setError("");
		try {
			const page = await api.listBookmarkedMessages(before);
			if (generation !== generationRef.current) return;
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
	useEffect(() => {
		isMountedRef.current = true;
		reload();

		return () => {
			isMountedRef.current = false;
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
				)
					reload();
			},
			[reload],
		),
	);
	useSocketEvent("message:hidden", reload);
	useSocketEvent("conversation:left", reload);

	async function remove(result: MessageSearchResultDTO) {
		if (removingRef.current) return;
		const generation = generationRef.current;
		removingRef.current = result.message.id;
		setRemovingId(result.message.id);
		setError("");
		try {
			await api.removeBookmark(result.conversation.id, result.message.id);
			if (generation === generationRef.current) reload();
		} catch (caught) {
			if (generation === generationRef.current)
				setError(caught instanceof Error ? caught.message : "Could not remove bookmark");
		} finally {
			removingRef.current = null;
			if (isMountedRef.current) setRemovingId(null);
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
