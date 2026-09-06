import type { MessageDTO, ReactionEmoji } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import {
	cacheMessageSnapshot,
	enqueueLocalMessage,
	readLocalOutbox,
	readMessageSnapshot,
	removeLocalMessage,
} from "@/lib/local-chat-store";
import { MAX_RETAINED_MESSAGES, MESSAGE_PAGE_SIZE } from "../constants/pagination";
import type { ThreadMessage } from "../types/thread-message";
import { buildDraftMessage, getNewestStoredMessage, isDraftId } from "../utils/build-draft-message";
import { toDraftAttachments } from "../utils/draft-attachment";
import { restoreLocalOutboxMessage, toLocalOutboxMessage } from "../utils/local-outbox";
import { mergeReloadedMessages } from "../utils/merge-messages";
import { optimizeImagesForUpload } from "../utils/optimize-image-upload";
import { toReplyQuote } from "../utils/reply-quote";
import { useMessageActions } from "./use-message-actions";
import { useSocketEvent } from "./use-socket-event";

/**
 * The files behind one optimistic image message, and the object URLs standing
 * in for them until the server has its own.
 *
 * Kept beside the thread rather than inside it: a `ThreadMessage` is the shape
 * the list renders, and a `File` is not something anything renders. The `urls`
 * are held separately from the draft's attachments so releasing them does not
 * depend on the draft still being in the array — which, on a discard, it is not.
 */
interface PendingUpload {
	filesPromise: Promise<File[]>;
	urls: string[];
}

interface LoadingMessageChanges {
	arrivals: Map<string, MessageDTO>;
	updates: Map<string, MessageDTO>;
	hiddenIds: Set<string>;
}

/**
 * Hands back one draft's object URLs, and forgets its files.
 *
 * Every `blob:` URL pins its file in memory until it is revoked or the document
 * goes; a tab left open on a busy conversation would accumulate every picture
 * ever sent from it. Safe to call twice and safe to call for an id that was
 * never registered, which is what lets every exit from a send call it without
 * first working out which kind of send it was.
 */
function releaseUpload(pending: Map<string, PendingUpload>, draftId: string): void {
	const upload = pending.get(draftId);
	if (!upload) return;

	for (const url of upload.urls) URL.revokeObjectURL(url);
	pending.delete(draftId);
}

interface ConversationMessages {
	/** Oldest first, which is the order the view reads. */
	messages: ThreadMessage[];
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	/** True while the first page of a conversation is in flight. */
	isLoadingThread: boolean;
	/** Why the first page could not be fetched, or "" when it could. */
	loadError: string;
	/** Fetches the first page again after `loadError`. */
	retryLoad: () => void;
	loadOlder: () => void;
	loadNewer: () => void;
	/** Catches the thread up after the socket was down. See `useSocketConnection`. */
	resync: () => void;
	/**
	 * Sends a message. Resolves once the server has it, but the bubble is on
	 * screen long before that — see the implementation.
	 */
	sendMessage: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		mentionedUserIds?: string[],
	) => Promise<void>;
	/**
	 * Sends a saved sticker. Not optimistic: a sticker's picture has dimensions
	 * the client does not know until it decodes the file, and the bubble-less
	 * layout reserves space from them — a sticker that resizes on arrival is
	 * worse than one that appears a beat later.
	 */
	sendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	sendFile: (
		file: File,
		content: string,
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	sendVoice: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	/** Sends a draft that failed, again. */
	retrySend: (draftId: string) => void;
	/** Throws a failed draft away. */
	discardDraft: (draftId: string) => void;
	/**
	 * Drops the oldest messages once the thread has more than it needs, so a long
	 * session stops growing an array React has to reconcile on every keystroke.
	 * Called by the list, which is the only thing that knows the reader is at the
	 * bottom and will not notice.
	 */
	trimHistory: () => void;
	editMessage: (messageId: string, content: string) => void;
	deleteMessage: (messageId: string) => void;
	toggleReaction: (messageId: string, emoji: ReactionEmoji) => void;
	hideMessage: (messageId: string) => void;
	targetMessageId: string | null;
}

/**
 * The whole life of one conversation's message list: the first page, older
 * pages, messages arriving, and messages changing.
 *
 * These were four separate pieces of `ChatPage`, and they were never really
 * independent — every one of them writes the same array, and three of them have
 * to agree about what "already on screen" means. Splitting them apart again
 * would mean handing `setMessages` to four callers and hoping.
 *
 * What is deliberately *not* here: the read marker. `useMarkRead` takes the id
 * of the newest loaded message, which is a fact about the page's viewport rather
 * than about this list.
 */
export function useConversationMessages(
	conversationId: string | null,
	onConversationsChanged: () => void,
	requestedMessageId: string | null = null,
): ConversationMessages {
	const [messages, setMessages] = useState<ThreadMessage[]>([]);
	const [hasMoreOlder, setHasMoreOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [hasMoreNewer, setHasMoreNewer] = useState(false);
	const [isLoadingNewer, setIsLoadingNewer] = useState(false);
	const [isLoadingThread, setIsLoadingThread] = useState(false);
	const [loadError, setLoadError] = useState("");
	// Bumped by `retryLoad` to re-run the effect below without changing which
	// conversation or message it is loading.
	const [reloadCount, setReloadCount] = useState(0);
	const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
	const [loadedCacheScope, setLoadedCacheScope] = useState<string | null>(null);
	const [restoredDraftIds, setRestoredDraftIds] = useState<string[]>([]);
	const pendingUploadsRef = useRef(new Map<string, PendingUpload>());
	const currentUserId = useAuth((state) => state.currentUser?.id);
	const cacheScope = currentUserId && conversationId ? `${currentUserId}:${conversationId}` : null;
	const deliverRef = useRef<(draft: ThreadMessage) => Promise<void>>(async () => undefined);
	const navigationGenerationRef = useRef(0);
	const activeCacheScopeRef = useRef<string | null>(null);
	// A cached historical window cannot establish that a return reached latest.
	// Keep requiring the server across retries until that navigation succeeds.
	const requiresServerPageRef = useRef(false);
	const loadingChangesRef = useRef<LoadingMessageChanges | null>(null);
	const olderRequestRef = useRef<number | null>(null);
	const newerRequestRef = useRef<number | null>(null);
	const resyncRequestRef = useRef<number | null>(null);
	// Live arrivals can sit beyond an unloaded gap after opening a search result.
	// Only a fetched page may advance the cursor across that gap.
	const newerCursorRef = useRef<string | null>(null);

	// Anything still in flight when the tab navigates away or the hook unmounts
	// has nobody left to settle it, and its URLs would outlive the component
	// holding the only reference to them.
	useEffect(() => {
		const pending = pendingUploadsRef.current;

		return () => {
			for (const draftId of [...pending.keys()]) releaseUpload(pending, draftId);
		};
	}, []);

	const { editMessage, deleteMessage, toggleReaction } = useMessageActions(conversationId, setMessages);
	const hideMessage = useCallback(
		(messageId: string) => {
			if (!conversationId) return;
			void api.hideMessage(conversationId, messageId);
		},
		[conversationId],
	);

	useEffect(() => {
		const generation = ++navigationGenerationRef.current;
		if (activeCacheScopeRef.current !== cacheScope) requiresServerPageRef.current = false;
		activeCacheScopeRef.current = cacheScope;
		if (requestedMessageId) requiresServerPageRef.current = true;
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
		setHasMoreOlder(false);
		setHasMoreNewer(false);
		setIsLoadingOlder(false);
		setIsLoadingNewer(false);
		setTargetMessageId(null);

		if (!conversationId || !currentUserId || !cacheScope) {
			loadingChangesRef.current = null;
			setMessages([]);
			setIsLoadingThread(false);
			setLoadError("");
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
			return [...page, ...arrived]
				.filter((message) => !loadingChanges.hiddenIds.has(message.id))
				.map(
					(message) =>
						loadingChanges.updates.get(message.id) ?? loadingChanges.arrivals.get(message.id) ?? message,
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
		setMessages([]);
		setLoadedCacheScope(null);
		setRestoredDraftIds([]);

		const localRequest = Promise.all([
			readMessageSnapshot(currentUserId, conversationId),
			readLocalOutbox(currentUserId, conversationId),
		])
			.then(([cached, queued]) => {
				if (!isCurrent) return;
				const restored = queued.map(restoreLocalOutboxMessage);
				for (const item of restored) {
					if (item.files.length === 0) continue;
					pendingUploadsRef.current.set(item.draft.id, {
						filesPromise: optimizeImagesForUpload(item.files),
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
				if (!isCurrent || (hasLocalMessages && !requiresServerPage)) return;
				setLoadError(error.message);
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
	}, [cacheScope, conversationId, currentUserId, requestedMessageId, reloadCount]);

	useEffect(() => {
		if (!currentUserId || !conversationId || loadedCacheScope !== cacheScope) return;
		const stored = messages.filter((message) => !isDraftId(message.id)).slice(-MAX_RETAINED_MESSAGES);
		void cacheMessageSnapshot(currentUserId, conversationId, stored).catch(() => undefined);
	}, [cacheScope, conversationId, currentUserId, loadedCacheScope, messages]);

	const retryLoad = useCallback(() => setReloadCount((current) => current + 1), []);

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

					return merged;
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

					return [...[...page].reverse().filter((message) => !knownIds.has(message.id)), ...current];
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

					return [...ordered, ...current.filter((message) => isDraftId(message.id))];
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
	 * Puts a draft on the wire and settles it, whichever way it goes.
	 *
	 * The success branch removes the draft rather than replacing it with the
	 * server's message, *unless* the message is not already there. The socket
	 * broadcast regularly beats this response — the server emits it before the
	 * response is serialised — so by the time this resolves the real message is
	 * usually on screen already, and replacing by draft id would show it twice.
	 *
	 * The files a draft is carrying come from `pendingUploadsRef` rather than
	 * from the draft itself, because a `ThreadMessage` has no room for a `File`
	 * and should not: what the thread renders is a `blob:` URL and a size. Keying
	 * them by draft id is also what makes retry work on an image — the id
	 * survives the failure, so the second attempt finds the same bytes.
	 */
	const deliver = useCallback(async (draft: ThreadMessage) => {
		try {
			const pendingUpload = pendingUploadsRef.current.get(draft.id);
			const files = pendingUpload ? await pendingUpload.filesPromise : undefined;
			const sent = await api.sendMessage(
				draft.conversationId,
				draft.content,
				files,
				draft.replyTo?.id,
				draft.mentionedUserIds,
				// The draft's own id goes with the send, and comes back on the
				// broadcast. Whichever of the two arrives first can then retire the
				// draft, instead of the socket appending a second copy that only the
				// response knows how to remove.
				draft.id,
			);

			releaseUpload(pendingUploadsRef.current, draft.id);
			void removeLocalMessage(draft.id).catch(() => undefined);
			if (activeCacheScopeRef.current !== `${draft.author?.id}:${draft.conversationId}`) return;
			loadingChangesRef.current?.arrivals.set(sent.id, sent);
			setMessages((current) => {
				const withoutDraft = current.filter((message) => message.id !== draft.id);

				return withoutDraft.some((message) => message.id === sent.id) ? withoutDraft : [...withoutDraft, sent];
			});
		} catch (error) {
			// Kept on screen rather than removed, and this is the whole point of the
			// state: a message that vanishes on a dropped connection takes the text
			// with it, and the sender usually does not notice until much later.
			setMessages((current) =>
				current.map((message) => (message.id === draft.id ? { ...message, deliveryState: "failed" } : message)),
			);
			throw error;
		}
	}, []);

	useEffect(() => {
		deliverRef.current = deliver;
	}, [deliver]);

	useEffect(() => {
		if (restoredDraftIds.length === 0) return;
		const restoredIds = new Set(restoredDraftIds);
		const drafts = messages.filter((message) => restoredIds.has(message.id));
		setRestoredDraftIds([]);
		for (const draft of drafts) void deliver(draft).catch(() => undefined);
	}, [deliver, messages, restoredDraftIds]);

	/**
	 * Sends a message, showing it immediately — pictures included.
	 *
	 * Images used to be the exception: awaited in the composer, behind a progress
	 * bar, because an optimistic gallery has to reserve each picture's space and
	 * a gallery that resizes when the upload lands is worse than no gallery. The
	 * objection was right and it was about *dimensions*, not about uploads, so
	 * `toDraftAttachments` decodes the picked files first and the bubble goes up
	 * at the size the stored one will be. Nothing moves when the real message
	 * arrives.
	 *
	 * The progress bar goes with it, and that is the trade. What replaces it is
	 * the picture itself, held at 60% until the server has it, and a gutter that
	 * says "Sending…" and then "Not sent" with a retry — which is more than the
	 * bar ever said, on the one occasion it mattered.
	 */
	const sendMessage = useCallback(
		async (content: string, attachments: File[], replyTo: MessageDTO | null, mentionedUserIds: string[] = []) => {
			if (!conversationId) return;
			const author = useAuth.getState().currentUser;
			if (!author) return;

			// Awaited before the bubble goes up rather than alongside it: a few
			// milliseconds of decoding buys a gallery that never resizes, and the
			// composer has already emptied so nothing is waiting on this.
			const local = attachments.length > 0 ? await toDraftAttachments(attachments) : [];
			const draft = {
				...buildDraftMessage(conversationId, author, content, replyTo ? toReplyQuote(replyTo) : null, local),
				mentionedUserIds,
			};
			if (attachments.length > 0) {
				pendingUploadsRef.current.set(draft.id, {
					// Begin after the draft has its dimensions, but do not await it:
					// the bubble appears now while the browser prepares smaller bytes.
					filesPromise: optimizeImagesForUpload(attachments),
					urls: local.map((attachment) => attachment.url),
				});
			}
			setMessages((current) => [...current, draft]);
			// The local commit deliberately precedes the network call. Once a bubble is
			// visible, closing the tab or losing power must not be able to erase it.
			await toLocalOutboxMessage(draft, author.id, attachments)
				.then(enqueueLocalMessage)
				.catch(() => undefined);

			await deliver(draft);
		},
		[conversationId, deliver],
	);

	const sendSticker = useCallback(
		async (stickerId: string, replyTo: MessageDTO | null) => {
			if (!conversationId) return;

			await api.sendSticker(conversationId, stickerId, replyTo?.id);
		},
		[conversationId],
	);

	const sendFile = useCallback(
		async (file: File, content: string, replyTo: MessageDTO | null, onProgress?: (percent: number) => void) => {
			if (!conversationId) return;
			await api.sendFile(conversationId, file, content, onProgress, replyTo?.id);
		},
		[conversationId],
	);

	const sendVoice = useCallback(
		async (recording: Blob, onProgress?: (percent: number) => void) => {
			if (!conversationId) return;
			await api.sendVoice(conversationId, recording, onProgress);
		},
		[conversationId],
	);

	const retrySend = useCallback(
		(draftId: string) => {
			const draft = messages.find((message) => message.id === draftId);
			if (!draft) return;

			const retried: ThreadMessage = { ...draft, deliveryState: "pending" };
			setMessages((current) => current.map((message) => (message.id === draftId ? retried : message)));
			void deliver(retried);
		},
		[messages, deliver],
	);

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

	const discardDraft = useCallback((draftId: string) => {
		// Before the row goes, not after: once it is out of the array there is
		// nothing left holding the URLs, and a `blob:` that is never revoked
		// keeps its file in memory for the life of the tab.
		releaseUpload(pendingUploadsRef.current, draftId);
		void removeLocalMessage(draftId).catch(() => undefined);
		setMessages((current) => current.filter((message) => message.id !== draftId));
	}, []);

	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					loadingChangesRef.current?.updates.set(message.id, message);
				}
			},
			[conversationId],
		),
	);

	useSocketEvent(
		"message:hidden",
		useCallback(
			(event: { conversationId: string; messageId: string }) => {
				if (event.conversationId === conversationId) {
					loadingChangesRef.current?.hiddenIds.add(event.messageId);
					setMessages((current) => current.filter((message) => message.id !== event.messageId));
				}
				onConversationsChanged();
			},
			[conversationId, onConversationsChanged],
		),
	);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					loadingChangesRef.current?.arrivals.set(message.id, message);
					if (message.clientId && message.author?.id === currentUserId) {
						releaseUpload(pendingUploadsRef.current, message.clientId);
						void removeLocalMessage(message.clientId).catch(() => undefined);
					}
					setMessages((current) => {
						// Two different duplicates to refuse. `id` catches a reconnect
						// replaying an event already on screen; `clientId` catches this
						// reader's own optimistic draft, which is drawn under an id the
						// server has never heard of and would otherwise sit beside the
						// real message until the HTTP response arrived to clear it.
						if (current.some((existing) => existing.id === message.id)) return current;
						const withoutDraft = message.clientId
							? current.filter((existing) => existing.id !== message.clientId)
							: current;

						return [...withoutDraft, message];
					});
				}
			},
			[conversationId, currentUserId],
		),
	);

	return {
		messages,
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		isLoadingThread,
		loadError,
		retryLoad,
		resync,
		sendMessage,
		sendSticker,
		sendFile,
		sendVoice,
		retrySend,
		discardDraft,
		trimHistory,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
		targetMessageId,
	};
}
