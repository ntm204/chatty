import type { MessageDTO } from "@chatty/shared-types";

/** A tombstone also retracts every embedded quote; untouched rows retain their identity. */
export function applyMessageUpdate<Message extends MessageDTO>(existing: Message, update: MessageDTO): Message {
	if (existing.id === update.id) return { ...existing, ...update };
	if (update.deletedAt && existing.replyTo?.id === update.id) {
		return {
			...existing,
			replyTo: { ...existing.replyTo, content: "", isDeleted: true, hasAttachment: false, attachmentUrl: null },
		};
	}

	return existing;
}

/** Keep an observed retraction authoritative over responses that started before it. */
export function applyMessageRetractions<Message extends MessageDTO>(
	messages: Message[],
	retractions: Map<string, MessageDTO>,
): Message[] {
	for (const message of messages) {
		if (message.deletedAt) retractions.set(message.id, message);
	}

	return messages.map((message) => {
		const retracted = retractions.get(message.id);
		if (retracted) return applyMessageUpdate(message, retracted);
		const parent = message.replyTo ? retractions.get(message.replyTo.id) : undefined;

		return parent ? applyMessageUpdate(message, parent) : message;
	});
}
