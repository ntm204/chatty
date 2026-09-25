import type { AttachmentWithMessageDTO, ConversationVaultSummaryDTO, MessageLinkDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "@/api/client";
import type { VaultTab } from "../constants/vault";
import { loadRetainedVaultPage } from "../utils/load-retained-vault-page";
import { useInfiniteScroll } from "./use-infinite-scroll";
import { useSocketEvent } from "./use-socket-event";

interface ConversationVault {
	/** Null until the counts arrive; a row shows no number rather than a wrong one. */
	summary: ConversationVaultSummaryDTO | null;
	attachments: AttachmentWithMessageDTO[];
	links: MessageLinkDTO[];
	isLoading: boolean;
	error: string;
	hasMore: boolean;
	nextCursor: string | undefined;
	loadMoreRef: RefObject<HTMLDivElement>;
	loadPage: (before?: string, replace?: boolean) => Promise<void>;
}

const PAGE_SIZE = 40;

/**
 * Everything the details panel reads, so the panel itself is about layout.
 *
 * Two requests with different lifetimes live here. The **summary** is fetched
 * once per conversation and is what the category list renders; a **page** is
 * fetched only for the category that is open, which is why `activeTab` may be
 * null. Opening the panel used to fetch forty images and their thumbnails
 * whether or not anybody wanted to look at photos.
 *
 * `requestSequence` is what makes switching categories safe: two pages in flight
 * can finish in either order, and without it the slower one appends its rows
 * under the wrong heading.
 */
export function useConversationVault(conversationId: string, activeTab: VaultTab | null): ConversationVault {
	const [summary, setSummary] = useState<ConversationVaultSummaryDTO | null>(null);
	const [attachments, setAttachments] = useState<AttachmentWithMessageDTO[]>([]);
	const [links, setLinks] = useState<MessageLinkDTO[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [hasMore, setHasMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | undefined>();
	const requestSequence = useRef(0);
	const pendingRef = useRef<number | null>(null);
	const retainedCountsRef = useRef(new Map<string, number>());
	const failedRequestRef = useRef<{ before: string | undefined; replace: boolean } | null>(null);
	const [revision, setRevision] = useState(0);
	const [loadedScope, setLoadedScope] = useState<string | null>(null);
	const pagesRef = useRef(
		new Map<
			string,
			{
				attachments: AttachmentWithMessageDTO[];
				links: MessageLinkDTO[];
				hasMore: boolean;
				nextCursor: string | undefined;
			}
		>(),
	);
	const scope = `${conversationId}:${activeTab}`;
	const refresh = useCallback((removedMessageId?: string, shouldClear = false) => {
		requestSequence.current++;
		setIsLoading(true);
		pagesRef.current.clear();
		setAttachments((current) => (shouldClear ? [] : current.filter((item) => item.messageId !== removedMessageId)));
		setLinks((current) => (shouldClear ? [] : current.filter((item) => item.messageId !== removedMessageId)));
		if (shouldClear) retainedCountsRef.current.clear();
		setRevision((value) => value + 1);
	}, []);
	useSocketEvent("message:updated", (message) => {
		if (message.conversationId === conversationId) refresh(message.deletedAt ? message.id : undefined);
	});
	useSocketEvent("message:new", (message) => {
		if (
			message.conversationId === conversationId &&
			(message.attachments.length || message.content.includes("://"))
		)
			refresh();
	});
	useSocketEvent("message:hidden", (event) => {
		if (event.conversationId === conversationId) refresh(event.messageId);
	});
	useSocketEvent("bookmark:changed", (event) => {
		if (event.conversationId === conversationId) setRevision((value) => value + 1);
	});
	useSocketEvent("conversation:left", (event) => {
		if (event.conversationId === conversationId) refresh(undefined, true);
	});

	const loadPage = useCallback(
		async (before?: string, replace = false) => {
			if (!activeTab || activeTab === "members") return;
			if (pendingRef.current === requestSequence.current) return;
			const failed = failedRequestRef.current;
			if (failed) ({ before, replace } = failed);
			const sequence = ++requestSequence.current;
			pendingRef.current = sequence;
			const retainCount = replace ? (retainedCountsRef.current.get(scope) ?? 0) : 0;
			setIsLoading(true);
			setError("");
			try {
				if (activeTab === "links") {
					const page = await loadRetainedVaultPage(
						(cursor) => api.listConversationLinks(conversationId, PAGE_SIZE, cursor),
						() => sequence === requestSequence.current,
						retainCount,
						before,
					);
					if (!page) return;
					setLoadedScope(scope);
					setLinks((current) =>
						replace
							? page.items
							: [
									...current,
									...page.items.filter(
										(item) => !current.some((existing) => existing.id === item.id),
									),
								],
					);
					setNextCursor(page.items.at(-1)?.id);
					setHasMore(page.hasMore);
				} else {
					const kind = activeTab === "media" ? "image" : activeTab === "files" ? "file" : "audio";
					const page = await loadRetainedVaultPage(
						(cursor) => api.listConversationMedia(conversationId, kind, PAGE_SIZE, cursor),
						() => sequence === requestSequence.current,
						retainCount,
						before,
					);
					if (!page) return;
					setLoadedScope(scope);
					setAttachments((current) =>
						replace
							? page.items
							: [
									...current,
									...page.items.filter(
										(item) => !current.some((existing) => existing.id === item.id),
									),
								],
					);
					setNextCursor(page.items.at(-1)?.id);
					setHasMore(page.hasMore);
				}
				failedRequestRef.current = null;
			} catch (caught) {
				if (sequence === requestSequence.current) {
					failedRequestRef.current = { before, replace };
					setError(caught instanceof Error ? caught.message : "Conversation storage could not be loaded");
				}
			} finally {
				if (pendingRef.current === sequence) pendingRef.current = null;
				if (sequence === requestSequence.current) setIsLoading(false);
			}
		},
		[activeTab, conversationId, scope],
	);

	const loadMoreRef = useInfiniteScroll<HTMLDivElement>(hasMore && Boolean(nextCursor) && !error, isLoading, () => {
		if (nextCursor) void loadPage(nextCursor);
	});

	useEffect(() => {
		let isCurrent = true;
		setSummary(null);
		api.getConversationVaultSummary(conversationId)
			.then((next) => {
				if (isCurrent) setSummary(next);
			})
			// Swallowed on purpose: the categories are still reachable without their
			// counts, and an error banner over a list that works would be noise.
			.catch(() => undefined);

		return () => {
			isCurrent = false;
		};
	}, [conversationId, revision]);

	useEffect(() => {
		failedRequestRef.current = null;
		const cached = pagesRef.current.get(scope);
		if (cached) {
			setLoadedScope(scope);
			setAttachments(cached.attachments);
			setLinks(cached.links);
			setNextCursor(cached.nextCursor);
			setHasMore(cached.hasMore);
			setIsLoading(false);
			setError("");
		} else {
			if (loadedScope !== scope) {
				setAttachments([]);
				setLinks([]);
				setNextCursor(undefined);
				setHasMore(false);
			}
			void loadPage(undefined, true);
		}

		return () => {
			requestSequence.current++;
		};
		// loadedScope describes the displayed rows, not a reason to restart a fetch.
	}, [loadPage, scope, revision]);

	useEffect(() => {
		if (activeTab && loadedScope === scope && !isLoading && !error) {
			pagesRef.current.set(scope, { attachments, links, hasMore, nextCursor });
			retainedCountsRef.current.set(scope, activeTab === "links" ? links.length : attachments.length);
		}
	}, [activeTab, scope, loadedScope, attachments, links, hasMore, nextCursor, isLoading, error]);

	return {
		summary,
		attachments,
		links,
		isLoading: isLoading || (activeTab !== null && loadedScope !== scope && !error),
		error,
		hasMore,
		nextCursor,
		loadMoreRef,
		loadPage,
	};
}
