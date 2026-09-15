import type { MessageDTO } from "@chatty/shared-types";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getMessageDraftGeneration } from "@/lib/message-drafts";
import { api } from "@/api/client";

interface SendAttempt {
	clientId: string;
	pending?: Promise<void>;
}

/** Retry identities live as long as the selected file, recording or failed sticker. */
export function useSessionMessageSends(conversationId: string | null, userId: string | undefined) {
	return useMemo(() => {
		const generation = userId ? getMessageDraftGeneration(userId) : -1;
		const mediaAttempts = new WeakMap<Blob, Map<string, SendAttempt>>();
		const stickerAttempts = new Map<string, SendAttempt>();

		function send(
			attempts: Map<string, SendAttempt>,
			key: string,
			request: (clientId: string) => Promise<MessageDTO>,
		): Promise<void> {
			if (!conversationId || !userId) return Promise.reject(new Error("Open a conversation to send a message."));
			let attempt = attempts.get(key);
			if (attempt?.pending) return attempt.pending;
			if (!attempt) {
				attempt = { clientId: crypto.randomUUID() };
				attempts.set(key, attempt);
			}
			const currentAttempt = attempt;
			// Defer dispatch until the promise is registered, including synchronous failures.
			currentAttempt.pending = Promise.resolve()
				.then(() => {
					if (
						useAuth.getState().currentUser?.id !== userId ||
						getMessageDraftGeneration(userId) !== generation
					)
						throw new Error("The account session changed. Open the conversation again.");

					return request(currentAttempt.clientId);
				})
				.then(() => {
					attempts.delete(key);
				})
				.finally(() => {
					delete currentAttempt.pending;
				});

			return currentAttempt.pending;
		}

		function attemptsFor(blob: Blob): Map<string, SendAttempt> {
			let attempts = mediaAttempts.get(blob);
			if (!attempts) {
				attempts = new Map();
				mediaAttempts.set(blob, attempts);
			}

			return attempts;
		}

		return {
			sendSticker: (stickerId: string, replyTo: MessageDTO | null) =>
				send(stickerAttempts, JSON.stringify([stickerId, replyTo?.id]), (clientId) =>
					api.sendSticker(conversationId!, stickerId, replyTo?.id, clientId),
				),
			sendFile: (
				file: File,
				content: string,
				replyTo: MessageDTO | null,
				onProgress?: (percent: number) => void,
			) =>
				send(attemptsFor(file), JSON.stringify([content, replyTo?.id]), (clientId) =>
					api.sendFile(conversationId!, file, content, onProgress, replyTo?.id, clientId),
				),
			sendVoice: (recording: Blob, onProgress?: (percent: number) => void) =>
				send(attemptsFor(recording), "voice", (clientId) =>
					api.sendVoice(conversationId!, recording, onProgress, clientId),
				),
		};
	}, [conversationId, userId]);
}
