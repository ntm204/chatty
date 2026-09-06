import { useEffect, useRef, useState } from "react";
import { announceDraftPreview } from "../utils/draft-preview";

interface MessageDraft {
	content: string;
	replyToId: string | null;
}

interface DraftSession {
	conversationId: string;
	draft: MessageDraft;
	timer?: ReturnType<typeof setTimeout>;
}

interface UseMessageDraftOptions {
	conversationId: string;
	content: string;
	replyToId: string | null;
	onRestore: (draft: MessageDraft) => void;
	isPaused?: boolean;
}

function persistDraft(session: DraftSession) {
	announceDraftPreview(session.conversationId, session.draft.content, session.draft.replyToId);
	try {
		const key = `chatty:draft:${session.conversationId}`;
		if (session.draft.content || session.draft.replyToId) localStorage.setItem(key, JSON.stringify(session.draft));
		else localStorage.removeItem(key);
	} catch {
		// Storage may be unavailable or full; keep the current composer usable.
	}
}

/** Device-local by design: unsent words are not silently synchronized to another session. */
export function useMessageDraft({
	conversationId,
	content,
	replyToId,
	onRestore,
	isPaused = false,
}: UseMessageDraftOptions) {
	const [restoredConversationId, setRestoredConversationId] = useState<string | null>(null);
	const onRestoreRef = useRef(onRestore);
	const sessionRef = useRef<DraftSession | null>(null);
	onRestoreRef.current = onRestore;

	useEffect(() => {
		let draft: MessageDraft = { content: "", replyToId: null };
		try {
			const raw = localStorage.getItem(`chatty:draft:${conversationId}`);
			const parsed: unknown = raw ? JSON.parse(raw) : null;
			if (
				parsed &&
				typeof parsed === "object" &&
				"content" in parsed &&
				typeof parsed.content === "string" &&
				"replyToId" in parsed &&
				(parsed.replyToId === null || typeof parsed.replyToId === "string")
			)
				draft = { content: parsed.content, replyToId: parsed.replyToId };
		} catch {
			// Malformed or unavailable storage is an empty draft, not a broken input.
		}
		// Each cleanup owns its conversation's committed draft. Never copy props
		// into this ref during render: they may belong to the next conversation.
		const session: DraftSession = { conversationId, draft };
		sessionRef.current = session;
		onRestoreRef.current(draft);
		setRestoredConversationId(conversationId);
		const flush = () => {
			clearTimeout(session.timer);
			persistDraft(session);
		};
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", handleVisibility);
			flush();
		};
	}, [conversationId]);

	useEffect(() => {
		const session = sessionRef.current;
		// Restoration schedules a render. The initial empty props must not be
		// saved before that render, including StrictMode's setup/cleanup replay.
		if (!session || restoredConversationId !== conversationId || isPaused) return;
		session.draft = { content, replyToId };
		announceDraftPreview(conversationId, content, replyToId);
		session.timer = setTimeout(() => persistDraft(session), 250);

		return () => clearTimeout(session.timer);
	}, [conversationId, restoredConversationId, content, replyToId, isPaused]);

	return () => {
		const session = sessionRef.current;
		if (!session || session.conversationId !== conversationId) return;
		clearTimeout(session.timer);
		session.draft = { content: "", replyToId: null };
		persistDraft(session);
	};
}
