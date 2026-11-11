import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getMessageDraftGeneration } from "@/lib/message-drafts";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { enqueueLocalMessage, removeLocalMessage } from "@/lib/local-chat-store";
import type { ConversationMessageStore } from "../types/conversation-messages";
import type { ThreadMessage } from "../types/thread-message";
import { buildDraftMessage } from "../utils/build-draft-message";
import { toDraftAttachments } from "../utils/draft-attachment";
import { toLocalOutboxMessage } from "../utils/local-outbox";
import { replaceDraft } from "../utils/replace-draft";
import { claimOutboxDelivery, releaseOutboxDelivery } from "../utils/outbox-delivery";
import { prepareImageFiles, releaseUpload } from "../utils/pending-upload";
import { toReplyQuote } from "../utils/reply-quote";

interface MessageOutboxOptions extends Omit<ConversationMessageStore, "retractionsRef"> {
	conversationId: string | null;
	messages: ThreadMessage[];
	restoredDraftIds: string[];
	setRestoredDraftIds: Dispatch<SetStateAction<string[]>>;
}

/**
 * Optimistic sends: the draft goes on screen and into the durable outbox, then
 * one delivery at a time per conversation settles it. Also replays drafts the
 * history restored from the outbox, retries and discards. Part of
 * `useConversationMessages`, which owns the array this writes.
 */
export function useMessageOutbox({
	conversationId,
	messages,
	setMessages,
	restoredDraftIds,
	setRestoredDraftIds,
	pendingUploadsRef,
	deliverRef,
	activeCacheScopeRef,
	loadingChangesRef,
}: MessageOutboxOptions) {
	const sendingDraftIdsRef = useRef(new Set<string>());
	const deliveryQueuesRef = useRef(new Map<string, Promise<void>>());

	// Anything still in flight when the tab navigates away or the hook unmounts
	// has nobody left to settle it, and its URLs would outlive the component
	// holding the only reference to them.
	useEffect(() => {
		const pending = pendingUploadsRef.current;

		return () => {
			for (const draftId of [...pending.keys()]) releaseUpload(pending, draftId);
		};
	}, []);

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
	const deliverNow = useCallback(async (draft: ThreadMessage) => {
		const authorId = draft.author?.id;
		if (!authorId || !claimOutboxDelivery(authorId, draft.id)) {
			sendingDraftIdsRef.current.delete(draft.id);

			return;
		}
		const generation = authorId ? getMessageDraftGeneration(authorId) : -1;
		const updateProgress = (deliveryPhase: ThreadMessage["deliveryPhase"], uploadProgress?: number) => {
			if (activeCacheScopeRef.current !== `${authorId}:${draft.conversationId}`) return;
			setMessages((current) =>
				current.map((message) =>
					message.id === draft.id ? { ...message, deliveryPhase, uploadProgress } : message,
				),
			);
		};
		try {
			const pendingUpload = pendingUploadsRef.current.get(draft.id);
			if (pendingUpload) updateProgress("preparing");
			const files = pendingUpload ? await pendingUpload.filesPromise : undefined;
			if (
				!authorId ||
				useAuth.getState().currentUser?.id !== authorId ||
				getMessageDraftGeneration(authorId) !== generation
			) {
				releaseUpload(pendingUploadsRef.current, draft.id);

				return;
			}
			if (files?.length) updateProgress("uploading");
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
				(percent) => updateProgress(percent >= 100 ? "confirming" : "uploading", percent),
			);

			releaseUpload(pendingUploadsRef.current, draft.id);
			void removeLocalMessage(draft.id).catch(() => undefined);
			if (activeCacheScopeRef.current !== `${draft.author?.id}:${draft.conversationId}`) return;
			loadingChangesRef.current?.arrivals.set(sent.id, sent);
			setMessages((current) => replaceDraft(current, draft.id, sent));
		} catch (error) {
			// Kept on screen rather than removed, and this is the whole point of the
			// state: a message that vanishes on a dropped connection takes the text
			// with it, and the sender usually does not notice until much later.
			setMessages((current) =>
				current.map((message) => (message.id === draft.id ? { ...message, deliveryState: "failed" } : message)),
			);
			throw error;
		} finally {
			sendingDraftIdsRef.current.delete(draft.id);
			releaseOutboxDelivery(authorId, draft.id);
		}
	}, []);

	/**
	 * One send at a time per conversation, in the order they were asked for.
	 *
	 * Parallel requests let the server stamp a later message first, so a quick
	 * "Hi" / "link" / "🙏" read back as "link" / "Hi" / "🙏" — on screen and after
	 * every reload. Waiting for the previous send costs a fast typist nothing
	 * visible: each bubble is already up as a draft. `ready` lets a send reserve
	 * its place before its local outbox write settles.
	 */
	const deliver = useCallback(
		(draft: ThreadMessage, ready?: Promise<boolean>): Promise<void> => {
			if (sendingDraftIdsRef.current.has(draft.id)) return Promise.resolve();
			sendingDraftIdsRef.current.add(draft.id);
			const queues = deliveryQueuesRef.current;
			const run = (queues.get(draft.conversationId) ?? Promise.resolve()).then(async () => {
				if (ready && !(await ready)) {
					sendingDraftIdsRef.current.delete(draft.id);
					releaseUpload(pendingUploadsRef.current, draft.id);

					return;
				}
				await deliverNow(draft);
			});
			const settled = run.catch(() => undefined);
			queues.set(draft.conversationId, settled);
			void settled.then(() => {
				if (queues.get(draft.conversationId) === settled) queues.delete(draft.conversationId);
			});

			return run;
		},
		[deliverNow],
	);

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
			const sessionGeneration = getMessageDraftGeneration(author.id);
			const isCurrentSession = () =>
				useAuth.getState().currentUser?.id === author.id &&
				getMessageDraftGeneration(author.id) === sessionGeneration;

			// Awaited before the bubble goes up rather than alongside it: a few
			// milliseconds of decoding buys a gallery that never resizes, and the
			// composer has already emptied so nothing is waiting on this.
			const local = attachments.length > 0 ? await toDraftAttachments(attachments) : [];
			if (!isCurrentSession()) {
				for (const attachment of local) URL.revokeObjectURL(attachment.url);

				return;
			}
			const draft = {
				...buildDraftMessage(conversationId, author, content, replyTo ? toReplyQuote(replyTo) : null, local),
				mentionedUserIds,
			};
			if (attachments.length > 0) {
				pendingUploadsRef.current.set(draft.id, {
					// Begin after the draft has its dimensions, but do not await it:
					// the bubble appears now while the browser prepares smaller bytes.
					filesPromise: prepareImageFiles(attachments),
					urls: local.map((attachment) => attachment.url),
				});
			}
			if (activeCacheScopeRef.current === `${author.id}:${conversationId}`)
				setMessages((current) => [...current, draft]);
			// The local commit deliberately precedes the network call. Once a bubble is
			// visible, closing the tab or losing power must not be able to erase it.
			const stored = toLocalOutboxMessage(draft, author.id, attachments)
				.then((queued) => {
					if (!isCurrentSession()) throw new Error("The account session changed");

					return enqueueLocalMessage(queued, sessionGeneration);
				})
				.catch(() => {
					setMessages((current) =>
						current.map((message) =>
							message.id === draft.id ? { ...message, hasLocalStorageError: true } : message,
						),
					);
				})
				.then(isCurrentSession);

			await deliver(draft, stored);
		},
		[conversationId, deliver],
	);

	const retrySend = useCallback(
		(draftId: string) => {
			const draft = messages.find((message) => message.id === draftId);
			if (!draft || draft.deliveryState !== "failed" || sendingDraftIdsRef.current.has(draftId)) return;

			const retried: ThreadMessage = { ...draft, deliveryState: "pending" };
			setMessages((current) => current.map((message) => (message.id === draftId ? retried : message)));
			void deliver(retried).catch(() => undefined);
		},
		[messages, deliver],
	);

	const discardDraft = useCallback((draftId: string) => {
		// Removing an in-flight request cannot undo a commit on the server.
		if (sendingDraftIdsRef.current.has(draftId)) return;
		// Before the row goes, not after: once it is out of the array there is
		// nothing left holding the URLs, and a `blob:` that is never revoked
		// keeps its file in memory for the life of the tab.
		releaseUpload(pendingUploadsRef.current, draftId);
		void removeLocalMessage(draftId).catch(() => undefined);
		setMessages((current) => current.filter((message) => message.id !== draftId));
	}, []);

	return { sendMessage, retrySend, discardDraft };
}
