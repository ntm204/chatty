import type { ConversationDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import { Bookmark, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { useBookmarkedMessages } from "../hooks/use-bookmarked-messages";
import { getAttachmentPreviewText } from "../utils";
import { getSearchResultTitle } from "../utils/search-result-title";

interface BookmarkedMessagesDialogProps {
	currentUserId: string;
	onClose: () => void;
	onSelectMessage: (conversation: ConversationDTO, messageId: string) => void;
}

export function BookmarkedMessagesDialog({ currentUserId, onClose, onSelectMessage }: BookmarkedMessagesDialogProps) {
	const bookmarks = useBookmarkedMessages(currentUserId);
	const ref = useDialog<HTMLDivElement>(onClose);
	const [openingId, setOpeningId] = useState<string | null>(null);
	const [openError, setOpenError] = useState("");
	const isOpeningRef = useRef(false);
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);

	async function open(result: MessageSearchResultDTO) {
		if (isOpeningRef.current) return;
		isOpeningRef.current = true;
		setOpeningId(result.message.id);
		setOpenError("");
		try {
			const conversation = await api.getConversation(result.conversation.id);
			if (isMountedRef.current) onSelectMessage(conversation, result.message.id);
		} catch (caught) {
			if (isMountedRef.current)
				setOpenError(caught instanceof Error ? caught.message : "Could not open the original conversation");
		} finally {
			isOpeningRef.current = false;
			if (isMountedRef.current) setOpeningId(null);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4">
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Bookmarked messages"
				tabIndex={-1}
				className="flex h-[min(70dvh,28rem)] w-full max-w-lg flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<header className="flex items-center gap-3 border-b border-rule px-4 py-3">
					<Bookmark className="size-4" />
					<h2 className="flex-1 text-sm font-semibold">Bookmarks</h2>
					<Button variant="ghost" onClick={onClose} aria-label="Close bookmarks" className="size-9 p-0">
						<X className="size-4" />
					</Button>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{bookmarks.isLoading && (
						<p role="status" className="p-3 text-sm text-ink-soft">
							Loading bookmarks…
						</p>
					)}
					{(bookmarks.error || openError) && (
						<p role="alert" className="p-3 text-sm text-signal">
							{bookmarks.error || openError}
						</p>
					)}
					{bookmarks.error && (
						<Button variant="ghost" onClick={bookmarks.reload}>
							Reload bookmarks
						</Button>
					)}
					{!bookmarks.isLoading && !bookmarks.error && !bookmarks.results.length && (
						<div className="p-3">
							<p className="text-sm text-ink-soft">No bookmarks yet.</p>
							<p className="mt-1 text-xs text-ink-faint">
								Open a message’s ⋯ menu and choose Bookmark message to keep it here.
							</p>
						</div>
					)}
					<ul className="space-y-2">
						{bookmarks.results.map((result) => (
							<li key={result.message.id} className="rounded-control border border-rule-soft">
								<Button
									variant="ghost"
									onClick={() => void open(result)}
									disabled={openingId !== null || bookmarks.removingId !== null}
									className="w-full flex-col items-start gap-1 p-3 text-left"
								>
									<span className="max-w-full truncate text-xs text-ink-faint">
										{getSearchResultTitle(result.conversation, currentUserId)}
									</span>
									<span className="line-clamp-3 w-full whitespace-pre-wrap break-words text-sm">
										{result.message.content || getAttachmentPreviewText(result.message.attachments)}
									</span>
									<span className="meta text-ink-faint">
										{openingId === result.message.id
											? "Opening…"
											: new Date(result.message.createdAt).toLocaleString()}
									</span>
								</Button>
								<Button
									variant="ghost"
									onClick={() => void bookmarks.remove(result)}
									disabled={openingId !== null || bookmarks.removingId !== null}
									className="mx-2 mb-2 text-xs text-ink-soft"
								>
									{bookmarks.removingId === result.message.id ? "Removing…" : "Remove bookmark"}
								</Button>
							</li>
						))}
					</ul>
					{bookmarks.hasMore && !bookmarks.error && (
						<Button
							variant="ghost"
							onClick={bookmarks.loadMore}
							disabled={bookmarks.isLoading || bookmarks.removingId !== null}
							className="mt-2 w-full"
						>
							More bookmarks
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
