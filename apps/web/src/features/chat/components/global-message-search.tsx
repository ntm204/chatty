import type { ConversationDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import { Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import type { useMessageSearch } from "../hooks/use-message-search";
import { getAttachmentPreviewText } from "../utils";
import { SearchResultSnippet } from "./search-result-snippet";
import { getSearchResultTitle } from "../utils/search-result-title";

interface GlobalMessageSearchProps {
	search: ReturnType<typeof useMessageSearch>;
	scrollPosition: React.MutableRefObject<{ query: string; top: number }>;
	currentUserId: string;
	onClose: () => void;
	onSelectMessage: (conversation: ConversationDTO, messageId: string) => void;
}

export function GlobalMessageSearch({
	currentUserId,
	onClose,
	onSelectMessage,
	search,
	scrollPosition,
}: GlobalMessageSearchProps) {
	const { query, setQuery, results, isSearching, error, hasNoResults, hasMore, isLoadingMore, loadMore, retry } =
		search;
	const [openingMessageId, setOpeningMessageId] = useState<string | null>(null);
	const [openError, setOpenError] = useState("");
	const dialogRef = useDialog<HTMLElement>(onClose);
	const listRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (listRef.current)
			listRef.current.scrollTop = scrollPosition.current.query === query ? scrollPosition.current.top : 0;
	}, [query, scrollPosition]);
	const inputRef = useRef<HTMLInputElement>(null);
	const isMountedRef = useRef(false);
	const isOpeningRef = useRef(false);
	useEffect(() => {
		isMountedRef.current = true;
		inputRef.current?.focus();

		return () => {
			isMountedRef.current = false;
		};
	}, []);

	async function openResult(result: MessageSearchResultDTO) {
		if (isOpeningRef.current) return;
		isOpeningRef.current = true;
		setOpeningMessageId(result.message.id);
		setOpenError("");
		try {
			// Results may belong to an archived conversation or an unloaded sidebar page.
			const conversation = await api.getConversation(result.conversation.id);
			if (isMountedRef.current) onSelectMessage(conversation, result.message.id);
		} catch (caught) {
			if (isMountedRef.current)
				setOpenError(caught instanceof Error ? caught.message : "This conversation could not be opened");
		} finally {
			isOpeningRef.current = false;
			if (isMountedRef.current) setOpeningMessageId(null);
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Search all messages"
				tabIndex={-1}
				className="flex h-[min(80dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<header className="flex shrink-0 items-center gap-3 border-b border-rule px-4 py-3">
					<Search className="size-4 shrink-0 text-ink-faint" />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						disabled={openingMessageId !== null}
						aria-label="Search all messages"
						placeholder="Search all messages"
						className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
					/>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close message search"
						className="size-9 shrink-0 p-0"
					>
						<X className="size-4" />
					</Button>
				</header>
				<div
					ref={listRef}
					onScroll={(event) => {
						scrollPosition.current = { query, top: event.currentTarget.scrollTop };
					}}
					className="min-h-0 flex-1 overflow-y-auto p-3"
				>
					{query.trim().length < 2 && (
						<p className="p-3 text-sm text-ink-soft">
							Find a message across your conversations. Enter at least two characters.
						</p>
					)}
					{isSearching && (
						<p role="status" className="p-3 text-sm text-ink-faint">
							Searching…
						</p>
					)}
					{(error || openError) && (
						<p role="alert" className="p-3 text-sm text-signal">
							{error || openError}
						</p>
					)}
					{error && (
						<Button variant="ghost" onClick={results.length ? loadMore : retry}>
							Try again
						</Button>
					)}
					{hasNoResults && <p className="p-3 text-sm text-ink-faint">No messages found.</p>}
					<ul className="space-y-1">
						{results.map((result) => (
							<li key={result.message.id}>
								<Button
									variant="ghost"
									disabled={openingMessageId !== null}
									onClick={() => void openResult(result)}
									className="w-full flex-col items-start gap-1 px-3 py-3 text-left"
								>
									<span className="max-w-full truncate text-xs text-ink-faint">
										{getSearchResultTitle(result.conversation, currentUserId)}
									</span>
									<SearchResultSnippet
										content={
											result.message.content ||
											getAttachmentPreviewText(result.message.attachments)
										}
										query={query}
									/>
									<span className="meta text-ink-faint">
										{openingMessageId === result.message.id
											? "Opening…"
											: new Date(result.message.createdAt).toLocaleString()}
									</span>
								</Button>
							</li>
						))}
					</ul>
					{hasMore && !error && (
						<Button variant="ghost" onClick={loadMore} disabled={isLoadingMore} className="mt-2 w-full">
							{isLoadingMore ? "Loading…" : "More results"}
						</Button>
					)}
				</div>
			</section>
		</div>
	);
}
