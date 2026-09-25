import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getMessageDraftGeneration, readMessageDraft, writeMessageDraft } from "@/lib/message-drafts";
import { announceDraftPreview } from "../utils/draft-preview";

interface MessageDraft {
	content: string;
	replyToId: string | null;
}

interface DraftSession {
	userId: string;
	conversationId: string;
	generation: number;
	draft: MessageDraft;
	timer?: ReturnType<typeof setTimeout>;
}

interface UseMessageDraftOptions {
	userId: string;
	conversationId: string;
	content: string;
	replyToId: string | null;
	onRestore: (draft: MessageDraft) => void;
	isPaused?: boolean;
}

function persistDraft(session: DraftSession): boolean {
	if (session.generation !== getMessageDraftGeneration(session.userId)) return true;
	announceDraftPreview(session.userId, session.conversationId, session.draft.content, session.draft.replyToId);
	try {
		writeMessageDraft(session.userId, session.conversationId, session.draft);

		return true;
	} catch {
		return false;
	}
}

/** Drafts stay on this device, separated by account and protected from logout cleanups. */
export function useMessageDraft({
	userId,
	conversationId,
	content,
	replyToId,
	onRestore,
	isPaused = false,
}: UseMessageDraftOptions) {
	const [restoredSession, setRestoredSession] = useState<DraftSession | null>(null);
	const [hasStorageError, setHasStorageError] = useState(false);
	const onRestoreRef = useRef(onRestore);
	const sessionRef = useRef<DraftSession | null>(null);
	onRestoreRef.current = onRestore;

	// Restore before the field becomes interactive; a late mount effect could
	// replace the user's first keystrokes with the saved draft.
	useLayoutEffect(() => {
		let draft: MessageDraft = { content: "", replyToId: null };
		try {
			draft = readMessageDraft(userId, conversationId);
			setHasStorageError(false);
		} catch (error) {
			// Malformed data is an empty draft; unavailable storage deserves an explanation.
			setHasStorageError(!(error instanceof SyntaxError));
		}
		const session: DraftSession = {
			userId,
			conversationId,
			generation: getMessageDraftGeneration(userId),
			draft,
		};
		sessionRef.current = session;
		onRestoreRef.current(draft);
		setRestoredSession(session);
		const flush = () => {
			clearTimeout(session.timer);
			setHasStorageError(!persistDraft(session));
		};
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", handleVisibility);
			clearTimeout(session.timer);
			persistDraft(session);
		};
	}, [userId, conversationId]);

	useEffect(() => {
		const session = sessionRef.current;
		// Restoration must render before props from the previous account/thread can be saved.
		if (!session || restoredSession !== session || isPaused) return;
		if (session.generation !== getMessageDraftGeneration(userId)) return;
		session.draft = { content, replyToId };
		announceDraftPreview(userId, conversationId, content, replyToId);
		session.timer = setTimeout(() => setHasStorageError(!persistDraft(session)), 250);

		return () => clearTimeout(session.timer);
	}, [userId, conversationId, restoredSession, content, replyToId, isPaused]);

	function clearDraft() {
		const session = sessionRef.current;
		if (!session || session.userId !== userId || session.conversationId !== conversationId) return;
		clearTimeout(session.timer);
		session.draft = { content: "", replyToId: null };
		setHasStorageError(!persistDraft(session));
	}

	return { clearDraft, hasStorageError };
}
