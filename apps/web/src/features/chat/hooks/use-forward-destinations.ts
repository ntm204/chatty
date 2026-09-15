import { useEffect, useRef, useState } from "react";
import type { ConversationDTO } from "@chatty/shared-types";
import { api } from "@/api/client";

export function useForwardDestinations() {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<ConversationDTO[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [revision, setRevision] = useState(0);
	const scopeRef = useRef({ query, revision });
	if (scopeRef.current.query !== query || scopeRef.current.revision !== revision)
		scopeRef.current = { query, revision };
	const pendingScopeRef = useRef<object | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);
	useEffect(() => {
		setItems([]);
		setHasMore(false);
		setError("");
		setIsLoading(true);
		const scope = scopeRef.current;
		const timer = window.setTimeout(
			() => {
				void fetchPage(scope);
			},
			query ? 250 : 0,
		);

		return () => window.clearTimeout(timer);
	}, [query, revision]);

	async function fetchPage(scope: object, before?: string) {
		if (pendingScopeRef.current === scope) return;
		pendingScopeRef.current = scope;
		setIsLoading(true);
		setError("");
		try {
			const page = await api.searchConversations(query.trim(), before);
			if (!isMountedRef.current || scope !== scopeRef.current) return;
			setItems((current) =>
				before
					? [...current, ...page.items.filter((row) => !current.some((existing) => existing.id === row.id))]
					: page.items,
			);
			setHasMore(page.hasMore);
		} catch (caught) {
			if (isMountedRef.current && scope === scopeRef.current)
				setError(caught instanceof Error ? caught.message : "Could not load conversations");
		} finally {
			if (pendingScopeRef.current === scope) pendingScopeRef.current = null;
			if (isMountedRef.current && scope === scopeRef.current) setIsLoading(false);
		}
	}

	return {
		query,
		setQuery,
		items,
		hasMore,
		isLoading,
		error,
		loadMore: () => {
			if (!isLoading && hasMore) void fetchPage(scopeRef.current, items.at(-1)?.id);
		},
		retry: () => {
			if (items.length) void fetchPage(scopeRef.current, items.at(-1)?.id);
			else setRevision((current) => current + 1);
		},
	};
}
