import type { AttachmentDTO, MessageDTO, UserDTO } from "@chatty/shared-types";
import type { ThreadMessage } from "../types/thread-message";

/** Marks an id as this tab's, so a draft is never mistaken for a server message. */
const DRAFT_ID_PREFIX = "draft:";

export function isDraftId(messageId: string): boolean {
	return messageId.startsWith(DRAFT_ID_PREFIX);
}

/**
 * The newest message the *server* knows about.
 *
 * Anything that hands an id back to the API — the read marker, the newer-page
 * cursor — has to use this rather than the last element of the array. A draft's
 * id names nothing on the server, so passing one asks a question it can only
 * answer with an error.
 *
 * A reverse loop rather than `findLast`, which is ES2023 and this app's `lib`
 * floor is ES2022.
 */
export function getNewestStoredMessage<T extends { id: string }>(messages: T[]): T | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message && !isDraftId(message.id)) return message;
	}

	return undefined;
}

/**
 * The bubble shown while a message is on its way to the server.
 *
 * It is a whole `MessageDTO` rather than a lighter shape so the thread can hold
 * it in the same array as everything else — which is what lets it join the run
 * of its author's previous messages, sit under the right day rule, and be laid
 * out by the cluster grammar without a second code path.
 *
 * `attachments` are local ones built by `toDraftAttachments`: real dimensions
 * and a `blob:` URL, so the gallery reserves the exact box the stored picture
 * will occupy and nothing shifts when the server's version replaces it.
 *
 * The fields that are null are null because they are facts the server owns and
 * has not yet stated: nothing may be edited, deleted or reacted to before it
 * exists, and `authorActionExpiresAt` counts from a `createdAt` the database
 * has not written yet. `createdAt` is the local clock purely so the message
 * sorts last and under today's rule; it is replaced by the server's within the
 * round trip.
 */
export function buildDraftMessage(
	conversationId: string,
	author: UserDTO,
	content: string,
	replyTo: MessageDTO["replyTo"],
	attachments: AttachmentDTO[] = [],
): ThreadMessage {
	return {
		id: `${DRAFT_ID_PREFIX}${crypto.randomUUID()}`,
		conversationId,
		kind: "user",
		author,
		content,
		attachments,
		isSticker: false,
		stickerKey: null,
		isForwarded: false,
		mentionedUserIds: [],
		createdAt: new Date().toISOString(),
		authorActionExpiresAt: null,
		editedAt: null,
		deletedAt: null,
		reactions: [],
		replyTo,
		deliveryState: "pending",
	};
}
