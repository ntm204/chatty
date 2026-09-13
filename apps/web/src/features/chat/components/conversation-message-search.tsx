import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { MESSAGE_SEARCH_MIN_LENGTH } from "../constants/search";
import { useMessageSearch } from "../hooks";
import type { MessageSearchSession } from "../types/message-search";

interface ConversationMessageSearchProps {
	conversationId: string;
	onSelectResult: (session: MessageSearchSession) => void;
	onClearResult: () => void;
	onClose: () => void;
}

/** Compact, conversation-scoped search opened from the chat header. */
export function ConversationMessageSearch({
	conversationId,
	onSelectResult,
	onClearResult,
	onClose,
}: ConversationMessageSearchProps) {
	const { query, setQuery, results, isSearching, error, hasNoResults, hasMore, isLoadingMore, loadMore } =
		useMessageSearch(conversationId);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const callbacksRef = useRef({ onSelectResult, onClearResult });
	const firstResultIdRef = useRef<string | null>(null);
	callbacksRef.current = { onSelectResult, onClearResult };

	useEffect(() => inputRef.current?.focus(), []);

	useEffect(() => {
		const firstResultId = results[0]?.message.id ?? null;
		if (firstResultId !== firstResultIdRef.current) {
			setActiveIndex(0);
			firstResultIdRef.current = firstResultId;
			if (results[0]) callbacksRef.current.onSelectResult({ query: query.trim(), results, activeIndex: 0 });
			else callbacksRef.current.onClearResult();
		}
	}, [results]); // The result snapshot, not each keystroke, starts navigation.

	function selectIndex(index: number) {
		if (!results[index]) return;
		setActiveIndex(index);
		onSelectResult({ query: query.trim(), results, activeIndex: index });
	}

	// `focus-within` on the bar, because the field inside drops its own outline
	// and carries no ring — without it, tabbing into the search lands on
	// something with no visible focus at all. Same treatment the group-members
	// search bar already gives its own bottom border.
	return (
		<div className="conversation-message-search flex min-h-12 shrink-0 items-center gap-2 border-b border-rule bg-paper-raised px-7 transition-colors focus-within:border-ink">
			<Search className="size-4 shrink-0 text-ink-faint" />
			<input
				ref={inputRef}
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") onClose();
					if (event.key === "Enter" && results.length > 0) {
						selectIndex(
							event.shiftKey
								? Math.max(0, activeIndex - 1)
								: Math.min(results.length - 1, activeIndex + 1),
						);
					}
				}}
				placeholder="Search in conversation"
				aria-label="Search in conversation"
				className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
			/>
			{isSearching && <span className="eyebrow text-ink-faint">Searching…</span>}
			{error && <span className="eyebrow max-w-48 truncate text-signal">{error}</span>}
			{hasNoResults && !isSearching && <span className="eyebrow text-ink-faint">No results</span>}
			{query.trim().length >= MESSAGE_SEARCH_MIN_LENGTH && results.length > 0 && (
				<span className="meta shrink-0 text-ink-faint">
					{activeIndex + 1} of {results.length}
				</span>
			)}
			{hasMore && activeIndex === results.length - 1 && (
				<Button variant="ghost" onClick={loadMore} disabled={isLoadingMore} className="eyebrow shrink-0 px-2">
					{isLoadingMore ? "Loading…" : "More"}
				</Button>
			)}
			<Button
				variant="ghost"
				onClick={() => selectIndex(activeIndex - 1)}
				disabled={activeIndex === 0 || results.length === 0}
				aria-label="Newer search result"
				className="size-8 shrink-0 p-0"
			>
				<ChevronUp className="size-4" />
			</Button>
			<Button
				variant="ghost"
				onClick={() => selectIndex(activeIndex + 1)}
				disabled={activeIndex >= results.length - 1}
				aria-label="Older search result"
				className="size-8 shrink-0 p-0"
			>
				<ChevronDown className="size-4" />
			</Button>
			<Button
				variant="ghost"
				onClick={onClose}
				aria-label="Close conversation search"
				className="size-8 shrink-0 p-0"
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}
