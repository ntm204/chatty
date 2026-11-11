import { applyMessageRetractions } from "@/utils/apply-message-update";
import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "@/api/client";
import { cacheMessageSnapshot, readLocalOutbox, readMessageSnapshot } from "@/lib/local-chat-store";
import { MAX_RETAINED_MESSAGES, MESSAGE_PAGE_SIZE } from "../constants/pagination";
import type { ConversationMessageStore, LoadingMessageChanges } from "../types/conversation-messages";
import type { ThreadMessage } from "../types/thread-message";
import { getNewestStoredMessage, isDraftId } from "../utils/build-draft-message";
import { restoreLocalOutboxMessage } from "../utils/local-outbox";
import { mergeReloadedMessages } from "../utils/merge-messages";
import { prepareImageFiles } from "../utils/pending-upload";
import { getErrorMessage } from "@/utils/get-error-message";

/** A hidden target and a conversation the reader can no longer access both deliberately answer 404. */
function isUnavailableContextError(error: unknown): boolean {
	return error instanceof Error && /\bnot found\b|\bno longer (?:exists|available)\b/i.test(error.message);
}

interface MessageHistoryOptions extends ConversationMessageStore {
	conversationId: string | null;
	currentUserId: string | undefined;
	requestedMessageId: string | null;
	onUnavailableMessageNavigation: (() => void) | undefined;
	messages: ThreadMessage[];
	setRestoredDraftIds: Dispatch<SetStateAction<string[]>>;
}

/**
 * Which window of the history is loaded: the first page (from the local
 * snapshot, then the server), older and newer pages, the catch-up after a
 * dropped socket, and trimming. Part of `useConversationMessages`, which owns
 * the array this writes.
 */
export function useMessageHistory({
	conversationId,
	currentUserId,
	requestedMessageId,
	onUnavailableMessageNavigation,
	messages,
	setMessages,
	setRestoredDraftIds,
	pendingUploadsRef,
	deliverRef,
	activeCacheScopeRef,
	loadingChangesRef,
	retractionsRef,
}: MessageHistoryOptions) {
	const [hasMoreOlder, setHasMoreOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [hasMoreNewer, setHasMoreNewer] = useState(false);
	const [isLoadingNewer, setIsLoadingNewer] = useState(false);
	const [isLoadingThread, setIsLoadingThread] = useState(false);
	const [loadError, setLoadError] = useState("");
	const [navigationError, setNavigationError] = useState("");
	// Bumped by `retryLoad` to re-run the effect below without changing which
	// conversation or message it is loading.
	const [reloadCount, setReloadCount] = useState(0);
	const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
	const [loadedCacheScope, setLoadedCacheScope] = useState<string | null>(null);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;
	const cacheScope = currentUserId && conversationId ? `${currentUserId}:${conversationId}` : null;
	const navigationGenerationRef = useRef(0);
	// A failed context request asks the page to clear its target. Let the normal
	// latest-page fetch that follows keep the reader's existing thread visible
	// instead of replacing it with an empty loading state for a round trip.
	const preserveVisibleThreadRef = useRef(false);
	const previousRequestedMessageIdRef = useRef<string | null>(null);
	// A cached historical window cannot establish that a return reached latest.
	// Keep requiring the server across retries until that navigation succeeds.
	const requiresServerPageRef = useRef(false);
	useEffect(() => {
		setNavigationError("");
	}, [conversationId, currentUserId]);
	const olderRequestRef = useRef<number | null>(null);
	const newerRequestRef = useRef<number | null>(null);
	const resyncRequestRef = useRef<number | null>(null);
	// Live arrivals can sit beyond an unloaded gap after opening a search result.
	// Only a fetched page may advance the cursor across that gap.
	const newerCursorRef = useRef<string | null>(null);

	useEffect(() => {
		const generation = ++navigationGenerationRef.current;
		const isSameCacheScope = activeCacheScopeRef.current === cacheScope;
		const hasVisibleThread = messagesRef.current.length > 0;
		const preserveVisibleThread =
			hasVisibleThread && isSameCacheScope && (Boolean(requestedMessageId) || preserveVisibleThreadRef.current);
		// Leaving a historical window keeps it on screen until the latest page can
		// replace it in one render, so the list glides to the live edge instead of
		// blanking and snapping. The cache is held back for a failed request only.
		const isLeavingHistory =
			!requestedMessageId &&
			previousRequestedMessageIdRef.current !== null &&
			hasVisibleThread &&
			isSameCacheScope &&
			!preserveVisibleThread;
		previousRequestedMessageIdRef.current = requestedMessageId;
		// This only lasts through the latest-page load immediately after an
		// unavailable target.
		if (!requestedMessageId) preserveVisibleThreadRef.current = false;
		if (!isSameCacheScope) requiresServerPageRef.current = false;
		activeCacheScopeRef.current = cacheScope;
		if (requestedMessageId) {
			requiresServerPageRef.current = true;
			setNavigationError("");
		}
		const requiresServerPage = requiresServerPageRef.current;
		olderRequestRef.current = null;
		newerRequestRef.current = null;
		resyncRequestRef.current = null;
		newerCursorRef.current = null;
		const loadingChanges: LoadingMessageChanges = {
			arrivals: new Map(),
			updates: new Map(),
			hiddenIds: new Set(),
		};
		loadingChangesRef.current = loadingChanges;
		const leaveHistoryWindow = () => {
			setHasMoreOlder(false);
			setHasMoreNewer(false);
			setTargetMessageId(null);
		};
		if (!preserveVisibleThread && !isLeavingHistory) leaveHistoryWindow();
		setIsLoadingOlder(false);
		setIsLoadingNewer(false);

		if (!conversationId || !currentUserId || !cacheScope) {
			loadingChangesRef.current = null;
			setMessages([]);
			setIsLoadingThread(false);
			setLoadError("");
			setNavigationError("");
			setLoadedCacheScope(null);
			setRestoredDraftIds([]);

			return;
		}

		let isCurrent = true;
		let hasLocalMessages = false;
		let hasServerPage = false;

		const mergeLoadingPage = (page: MessageDTO[]): MessageDTO[] => {
			const knownIds = new Set(page.map((message) => message.id));
			const arrived = [...loadingChanges.arrivals.values()].filter((message) => !knownIds.has(message.id));

			// Updates replace messages in the fetched window; an edit elsewhere in
			// history must not append that message outside the page's cursors.
			return applyMessageRetractions(
				[...page, ...arrived]
					.filter((message) => !loadingChanges.hiddenIds.has(message.id))
					.map(
						(message) =>
							loadingChanges.updates.get(message.id) ??
							loadingChanges.arrivals.get(message.id) ??
							message,
					),
				retractionsRef.current,
			);
		};

		const request = requestedMessageId
			? api.getMessageContext(conversationId, requestedMessageId, MESSAGE_PAGE_SIZE)
			: api.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE }).then((page) => ({
					messages: [...page].reverse(),
					hasMoreOlder: page.length === MESSAGE_PAGE_SIZE,
					hasMoreNewer: false,
				}));

		setIsLoadingThread(true);
		setLoadError("");
		if (!preserveVisibleThread && !isLeavingHistory) {
			setMessages([]);
			setLoadedCacheScope(null);
			setRestoredDraftIds([]);
		}

		type LocalThread = [MessageDTO[], Awaited<ReturnType<typeof readLocalOutbox>>];
		let heldLocalThread: LocalThread | null = null;
		const applyLocalThread = ([cached, queued]: LocalThread) => {
			const restored = queued.map(restoreLocalOutboxMessage);
			for (const item of restored) {
				if (item.files.length === 0) continue;
				pendingUploadsRef.current.set(item.draft.id, {
					filesPromise: prepareImageFiles(item.files),
					urls: item.urls,
				});
			}
			hasLocalMessages = cached.length > 0 || restored.length > 0;
			setMessages((current) => {
				const drafts = restored.map((item) => item.draft);
				if (!hasServerPage) {
					const knownIds = new Set([...cached, ...drafts].map((message) => message.id));
					const currentDrafts = current.filter(
						(message) => isDraftId(message.id) && !knownIds.has(message.id),
					);

					return [...mergeLoadingPage(cached), ...drafts, ...currentDrafts];
				}
				const known = new Set(current.map((message) => message.id));

				return [...current, ...drafts.filter((draft) => !known.has(draft.id))];
			});
			setRestoredDraftIds(restored.map((item) => item.draft.id));
			setLoadedCacheScope(cacheScope);
		};

		const localRequest = (
			preserveVisibleThread
				? Promise.resolve<LocalThread>([[], []])
				: Promise.all([
						readMessageSnapshot(currentUserId, conversationId),
						readLocalOutbox(currentUserId, conversationId),
					])
		)
			.then((localThread) => {
				if (!isCurrent || preserveVisibleThread) return;
				if (isLeavingHistory) heldLocalThread = localThread;
				else applyLocalThread(localThread);
			})
			.catch(() => {
				if (isCurrent) setLoadedCacheScope(cacheScope);
			});

		const serverRequest = request
			.then((page) => {
				// Switching conversations quickly can land an older response after a
				// newer one; without this the wrong conversation's messages appear.
				if (!isCurrent) return;

				hasServerPage = true;
				// Keep durable drafts beside the fresh page. The server history omits
				// client ids, so the outbox replay is what resolves a send whose original
				// response disappeared after commit.
				setMessages((current) => {
					// The page and cache may have been read before a socket event or send
					// response arrived. Keep those arrivals while replacing the window.
					return [...mergeLoadingPage(page.messages), ...current.filter((message) => isDraftId(message.id))];
				});
				// A full page probably means more exist. When the total is an exact
				// multiple of the page size this costs one empty request at the end,
				// which is cheaper than asking the server for a count every time.
				setHasMoreOlder(page.hasMoreOlder);
				setHasMoreNewer(page.hasMoreNewer);
				newerCursorRef.current = getNewestStoredMessage(page.messages)?.id ?? null;
				if (!requestedMessageId) requiresServerPageRef.current = false;
				setTargetMessageId(requestedMessageId);
			})
			.catch(async (error: Error) => {
				// Without this the thread rendered empty on any failure, which is the
				// one thing a conversation with history is definitely not — and it
				// offered nothing to try again with.
				await localRequest;
				if (!isCurrent) return;
				if (isLeavingHistory) {
					leaveHistoryWindow();
					if (heldLocalThread) applyLocalThread(heldLocalThread);
				}
				if (hasLocalMessages && !requiresServerPage) return;
				if (requestedMessageId && isUnavailableContextError(error)) {
					setNavigationError("The original message is no longer available.");
					setTargetMessageId(null);
					preserveVisibleThreadRef.current = hasVisibleThread && isSameCacheScope;
					onUnavailableMessageNavigation?.();

					return;
				}
				setLoadError(getErrorMessage(error, "Something went wrong on our side."));
			});

		void Promise.allSettled([localRequest, serverRequest]).then(() => {
			if (!isCurrent) return;
			loadingChangesRef.current = null;
			setIsLoadingThread(false);
		});

		return () => {
			isCurrent = false;
			if (navigationGenerationRef.current === generation) navigationGenerationRef.current += 1;
		};
	}, [cacheScope, conversationId, currentUserId, onUnavailableMessageNavigation, requestedMessageId, reloadCount]);

	useEffect(() => {
		if (!currentUserId || !conversationId || loadedCacheScope !== cacheScope) return;
		const stored = messages.filter((message) => !isDraftId(message.id)).slice(-MAX_RETAINED_MESSAGES);
		void cacheMessageSnapshot(currentUserId, conversationId, stored).catch(() => undefined);
	}, [cacheScope, conversationId, currentUserId, loadedCacheScope, messages]);

	const retryLoad = useCallback(() => setReloadCount((current) => current + 1), []);
	const dismissNavigationError = useCallback(() => setNavigationError(""), []);

	/**
	 * Refetches the newest page and folds it into what is on screen.
	 *
	 * A page rather than everything after the newest held message, because the
	 * gap a dead socket leaves is not only missing messages: an edit, a delete or
	 * a reaction that landed while it was down changed a message that is still
	 * displayed, and appending cannot repair that. See `mergeReloadedMessages`.
	 *
	 * Skipped while `hasMoreNewer` is true. That state means the reader jumped to
	 * a search result and is looking at a window in the middle of the history;
	 * pulling them to the live end would throw away the thing they went to find.
	 */
	const resync = useCallback(() => {
		if (!conversationId || isLoadingThread) return;
		const failedDrafts = messages.filter((message) => message.deliveryState === "failed");
		if (failedDrafts.length > 0) {
			const failedIds = new Set(failedDrafts.map((message) => message.id));
			setMessages((current) =>
				current.map((message) =>
					failedIds.has(message.id) ? { ...message, deliveryState: "pending" } : message,
				),
			);
			for (const draft of failedDrafts) {
				void deliverRef.current({ ...draft, deliveryState: "pending" }).catch(() => undefined);
			}
		}
		if (hasMoreNewer || resyncRequestRef.current !== null) return;
		const generation = navigationGenerationRef.current;
		resyncRequestRef.current = generation;

		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE })
			.then((page) => {
				if (navigationGenerationRef.current !== generation) return;
				const reloaded = [...page].reverse();
				setMessages((current) => {
					const merged = mergeReloadedMessages(current, reloaded);

					// No overlap means the disconnected interval exceeded one page.
					if (merged[0]?.id !== current[0]?.id) setHasMoreOlder(page.length === MESSAGE_PAGE_SIZE);

					return applyMessageRetractions(merged, retractionsRef.current);
				});
			})
			.catch(() => {
				// Leaves the screen exactly as it was, which is where it already was.
				// The connection banner is still up and the next reconnect tries again.
			})
			.finally(() => {
				if (navigationGenerationRef.current === generation) resyncRequestRef.current = null;
			});
	}, [conversationId, hasMoreNewer, isLoadingThread, messages]);

	const loadOlder = useCallback(() => {
		const oldestMessage = messages[0];
		if (!conversationId || !oldestMessage || isLoadingThread || olderRequestRef.current !== null || !hasMoreOlder) {
			return;
		}

		const generation = navigationGenerationRef.current;
		olderRequestRef.current = generation;
		setIsLoadingOlder(true);
		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, before: oldestMessage.id })
			.then((page) => {
				if (navigationGenerationRef.current !== generation) return;
				setMessages((current) => {
					const knownIds = new Set(current.map((message) => message.id));

					return applyMessageRetractions(
						[...[...page].reverse().filter((message) => !knownIds.has(message.id)), ...current],
						retractionsRef.current,
					);
				});
				setHasMoreOlder(page.length === MESSAGE_PAGE_SIZE);
			})
			.catch(() => {
				// The loaded snapshot remains usable; the connection banner owns retry.
			})
			.finally(() => {
				if (navigationGenerationRef.current !== generation) return;
				olderRequestRef.current = null;
				setIsLoadingOlder(false);
			});
	}, [conversationId, messages, isLoadingThread, hasMoreOlder]);

	const loadNewer = useCallback(() => {
		const cursor = newerCursorRef.current;
		if (!conversationId || !cursor || isLoadingThread || newerRequestRef.current !== null || !hasMoreNewer) return;
		const generation = navigationGenerationRef.current;
		newerRequestRef.current = generation;
		setIsLoadingNewer(true);
		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, after: cursor })
			.then((page) => {
				if (navigationGenerationRef.current !== generation) return;
				newerCursorRef.current = page[page.length - 1]?.id ?? cursor;
				setMessages((current) => {
					const knownIds = new Set(current.map((message) => message.id));
					const stored = current.filter((message) => !isDraftId(message.id));
					const added = page.filter((message) => !knownIds.has(message.id));
					// A page belongs before any live arrivals beyond its end. Keep local
					// drafts last regardless of the sender's wall clock.
					const ordered = [...stored, ...added].sort(
						(left, right) =>
							left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
					);

					return applyMessageRetractions(
						[...ordered, ...current.filter((message) => isDraftId(message.id))],
						retractionsRef.current,
					);
				});
				setHasMoreNewer(page.length === MESSAGE_PAGE_SIZE);
			})
			.catch(() => {
				// Same as older paging: preserve the window already on screen.
			})
			.finally(() => {
				if (navigationGenerationRef.current !== generation) return;
				newerRequestRef.current = null;
				setIsLoadingNewer(false);
			});
	}, [conversationId, isLoadingThread, hasMoreNewer]);

	/**
	 * Forgets the oldest page, and admits there is more above again.
	 *
	 * The inverse of `loadOlder` in every respect, which is why it needs no
	 * machinery of its own: `hasMoreOlder` going back to true is what puts the
	 * scroll handler back in charge of re-fetching what was dropped, through the
	 * path that fetched it the first time.
	 *
	 * `hasMoreOlder` is set unconditionally rather than only when something was
	 * removed, because the guard above has already established that something
	 * was: below the cap this returns without touching anything.
	 */
	const trimHistory = useCallback(() => {
		if (messages.length <= MAX_RETAINED_MESSAGES) return;

		setMessages((current) => current.slice(current.length - MAX_RETAINED_MESSAGES));
		setHasMoreOlder(true);
	}, [messages]);

	return {
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		isLoadingThread,
		loadError,
		navigationError,
		dismissNavigationError,
		retryLoad,
		resync,
		trimHistory,
		targetMessageId,
	};
}
