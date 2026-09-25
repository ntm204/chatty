import type { UserDTO } from "@chatty/shared-types";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";

interface UserSearch {
	query: string;
	setQuery: (query: string) => void;
	results: UserDTO[];
	isSearching: boolean;
	error: string;
	hasNoResults: boolean;
	search: (event: React.FormEvent<HTMLFormElement>) => void;
	reset: () => void;
}

/**
 * The "find someone by name, handle or email" state machine.
 *
 * Extracted because it is about to have a second, near-identical caller
 * (adding a member to an existing group, alongside starting a new
 * conversation) — searching is a fetch-loading-error state machine either
 * way, and the two screens would otherwise carry the exact same four
 * `useState` calls. What differs between them — multi-select-then-confirm
 * versus click-to-add-immediately — is the interaction, not the search
 * itself, so only that part stays in each component.
 *
 * `excludeUserIds` filters results client-side rather than being sent to the
 * server: it is "people already in this specific group", a fact this screen
 * knows and the search endpoint has no reason to.
 */
export function useUserSearch(excludeUserIds: string[] = []): UserSearch {
	// query and results are kept apart on purpose: the query changes on every
	// keystroke, the results only when a search completes.
	const [query, updateQuery] = useState("");
	const [results, setResults] = useState<UserDTO[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState("");
	const [hasSearched, setHasSearched] = useState(false);
	const generationRef = useRef(0);
	useEffect(
		() => () => {
			generationRef.current++;
		},
		[],
	);

	function setQuery(value: string) {
		generationRef.current++;
		updateQuery(value);
		setResults([]);
		setError("");
		setIsSearching(false);
		setHasSearched(false);
	}

	function search(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const trimmed = query.trim();
		if (!trimmed) return;
		const generation = ++generationRef.current;
		if (!navigator.onLine) {
			setIsSearching(false);
			setHasSearched(false);
			setResults([]);
			setError("Connect to find people.");

			return;
		}

		setIsSearching(true);
		setError("");
		api.searchUsers(trimmed)
			.then((found) => {
				if (generation !== generationRef.current) return;
				setResults(found);
				setHasSearched(true);
			})
			.catch((searchError: Error) => {
				if (generation === generationRef.current) setError(searchError.message);
			})
			.finally(() => {
				if (generation === generationRef.current) setIsSearching(false);
			});
	}

	function reset() {
		setQuery("");
		setResults([]);
		setError("");
	}

	const visibleResults = results.filter((user) => !excludeUserIds.includes(user.id));

	return {
		query,
		setQuery,
		results: visibleResults,
		isSearching,
		error,
		hasNoResults: hasSearched && !isSearching && !error && visibleResults.length === 0,
		search,
		reset,
	};
}
