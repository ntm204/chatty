import { useCallback, useEffect, useRef } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { getMessageDraftGeneration } from "@/lib/message-drafts";
import {
	readLocalOutboxForUser,
	removeLocalMessage,
	type LocalOutboxAttachment,
	type LocalOutboxMessage,
} from "@/lib/local-chat-store";
import { getSocket } from "@/lib/socket";
import { claimOutboxDelivery, releaseOutboxDelivery } from "../utils/outbox-delivery";

const OUTBOX_REPLAY_BATCH_SIZE = 10;

interface UseOutboxReplayOptions {
	userId: string | undefined;
	activeConversationId: string | null;
}

function isOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine;
}

function isSupportedAttachment(attachment: LocalOutboxAttachment): boolean {
	return attachment.type.startsWith("image/");
}

function isReplayableMessage(message: LocalOutboxMessage): boolean {
	return message.attachments.every(isSupportedAttachment);
}

function toOutboxFile(attachment: LocalOutboxAttachment): File {
	return new File([attachment.bytes], attachment.name, {
		type: attachment.type,
		lastModified: attachment.lastModified,
	});
}

/**
 * Replays durable text/image sends that no longer have a mounted thread.
 *
 * The thread still owns its own visible optimistic draft. This coordinator
 * deliberately skips that thread, then uses the same per-tab claim as it does
 * if the reader navigates back while a background replay is in flight.
 */
export function useOutboxReplay({ userId, activeConversationId }: UseOutboxReplayOptions): void {
	const activeConversationIdRef = useRef(activeConversationId);
	const attemptedIdsRef = useRef(new Set<string>());
	const isReplayingRef = useRef(false);
	const replayRequestedRef = useRef(false);
	activeConversationIdRef.current = activeConversationId;

	const replay = useCallback(
		async (retryFailed: boolean) => {
			if (!userId || !isOnline()) return;
			if (retryFailed) attemptedIdsRef.current.clear();
			if (isReplayingRef.current) {
				replayRequestedRef.current = true;

				return;
			}

			const sessionGeneration = getMessageDraftGeneration(userId);
			const isCurrentSession = () =>
				useAuth.getState().currentUser?.id === userId &&
				getMessageDraftGeneration(userId) === sessionGeneration;
			const claimSkippedIds = new Set<string>();
			isReplayingRef.current = true;

			try {
				do {
					replayRequestedRef.current = false;
					if (!isCurrentSession() || !isOnline()) return;

					const queued = await readLocalOutboxForUser(userId);
					if (!isCurrentSession() || !isOnline()) return;

					const candidates = queued
						.filter(
							(message) =>
								message.conversationId !== activeConversationIdRef.current &&
								isReplayableMessage(message) &&
								!attemptedIdsRef.current.has(message.id) &&
								!claimSkippedIds.has(message.id),
						)
						.slice(0, OUTBOX_REPLAY_BATCH_SIZE);
					let claimedCount = 0;

					for (const message of candidates) {
						if (!isCurrentSession() || !isOnline()) return;
						if (message.conversationId === activeConversationIdRef.current) continue;
						if (!claimOutboxDelivery(userId, message.id)) {
							claimSkippedIds.add(message.id);

							continue;
						}
						attemptedIdsRef.current.add(message.id);
						claimedCount += 1;

						try {
							const files = message.attachments.map(toOutboxFile);
							if (!isCurrentSession() || !isOnline()) continue;
							await api.sendMessage(
								message.conversationId,
								message.content,
								files,
								message.replyTo?.id,
								message.mentionedUserIds,
								message.id,
							);
							if (isCurrentSession()) await removeLocalMessage(message.id);
						} catch {
							// One failed replay stays durable and waits for the next online signal.
						} finally {
							releaseOutboxDelivery(userId, message.id);
						}
					}

					// Drain a large queue once per online event without retrying an item that
					// just failed in a tight loop.
					if (candidates.length === OUTBOX_REPLAY_BATCH_SIZE && claimedCount > 0)
						replayRequestedRef.current = true;
				} while (replayRequestedRef.current);
			} finally {
				isReplayingRef.current = false;
			}
		},
		[userId],
	);

	useEffect(() => {
		if (!userId) {
			attemptedIdsRef.current.clear();

			return;
		}

		const replayOnOnline = () => void replay(true);
		const socket = getSocket();
		window.addEventListener("online", replayOnOnline);
		socket.on("connect", replayOnOnline);
		void replay(false);

		return () => {
			window.removeEventListener("online", replayOnOnline);
			socket.off("connect", replayOnOnline);
		};
	}, [replay, userId]);

	useEffect(() => {
		void replay(false);
	}, [activeConversationId, replay]);
}
