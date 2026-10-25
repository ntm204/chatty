import type { MessageDTO } from "@chatty/shared-types";

/**
 * Puts the confirmed message where its draft was drawn, not at the end.
 *
 * Appending reordered a burst: the first reply to land jumped below drafts the
 * reader had typed after it. Without the draft (another tab sent it, or it was
 * already retired) the message is simply new and goes last.
 */
export function replaceDraft<Message extends MessageDTO>(
	current: Message[],
	draftId: string,
	confirmed: Message,
): Message[] {
	const withoutDraft = current.filter((message) => message.id !== draftId);
	if (withoutDraft.some((message) => message.id === confirmed.id)) return withoutDraft;
	const index = current.findIndex((message) => message.id === draftId);
	if (index === -1) return [...current, confirmed];

	return [...current.slice(0, index), confirmed, ...current.slice(index + 1)];
}
