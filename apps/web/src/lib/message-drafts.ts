interface StoredMessageDraft {
	content: string;
	replyToId: string | null;
}

const DRAFT_PREFIX = "chatty:draft:";
const ACCOUNT_DRAFT_PREFIX = "chatty:user-draft:";
const generations = new Map<string, number>();

export function getMessageDraftKey(userId: string, conversationId: string): string {
	return `${ACCOUNT_DRAFT_PREFIX}${userId}:${conversationId}`;
}

export function getMessageDraftGeneration(userId: string): number {
	return generations.get(userId) ?? 0;
}

export function readMessageDraft(userId: string, conversationId: string): StoredMessageDraft {
	// Legacy drafts have no trustworthy owner. Never assign them to the next login.
	localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
	const raw = localStorage.getItem(getMessageDraftKey(userId, conversationId));
	const parsed: unknown = raw ? JSON.parse(raw) : null;
	if (
		parsed &&
		typeof parsed === "object" &&
		"content" in parsed &&
		typeof parsed.content === "string" &&
		"replyToId" in parsed &&
		(parsed.replyToId === null || typeof parsed.replyToId === "string")
	) {
		return { content: parsed.content, replyToId: parsed.replyToId };
	}

	return { content: "", replyToId: null };
}

export function writeMessageDraft(userId: string, conversationId: string, draft: StoredMessageDraft): void {
	const key = getMessageDraftKey(userId, conversationId);
	if (draft.content || draft.replyToId) localStorage.setItem(key, JSON.stringify(draft));
	else localStorage.removeItem(key);
}

/** Invalidate pending React cleanups synchronously, before asynchronous account cleanup. */
export function clearMessageDrafts(userId: string): void {
	generations.set(userId, getMessageDraftGeneration(userId) + 1);
	try {
		const prefix = `${ACCOUNT_DRAFT_PREFIX}${userId}:`;
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith(prefix) || key.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
		}
	} catch {
		// Storage can be revoked independently of the session. Late writes stay invalidated.
	}
}
