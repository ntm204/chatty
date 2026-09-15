import { api } from "@/api/client";
import { useEffect, useRef, useState } from "react";
import type { ReactionEmoji } from "@chatty/shared-types";
import type { MessageRowActions } from "../types/message-row-actions";
import type { ThreadMessage } from "../types/thread-message";
import { bindMessageRowActions } from "../utils/bind-message-row-actions";

/** Catch writes at the row boundary so feedback survives the action menu closing. */
export function useMessageRowMutations(message: ThreadMessage, isPinned: boolean, actions: MessageRowActions) {
	const bound = bindMessageRowActions(message, isPinned, actions);
	const [isPending, setIsPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const isPendingRef = useRef(false);
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);

	async function run(action: () => void | Promise<void>, label: string) {
		if (isPendingRef.current) return;
		isPendingRef.current = true;
		setIsPending(true);
		setError(null);
		setNotice(null);
		try {
			await action();
		} catch {
			// A lost response may follow a committed write. Never automatically
			// repeat a toggle: that could undo the user's intended reaction.
			if (isMountedRef.current) setError(`Could not confirm ${label}. Check the message before trying again.`);
		} finally {
			isPendingRef.current = false;
			if (isMountedRef.current) setIsPending(false);
		}
	}

	return {
		...bound,
		isPending,
		error,
		notice,
		onBookmark: () =>
			run(async () => {
				await api.saveMessage(message.conversationId, message.id);
				if (isMountedRef.current) setNotice("Message bookmarked.");
			}, "bookmarking"),
		onDeleteForEveryone: () => run(bound.onDeleteForEveryone, "deletion for everyone"),
		onDeleteForMe: () => run(bound.onDeleteForMe, "deletion for you"),
		onTogglePin: () => run(bound.onTogglePin, isPinned ? "unpinning" : "pinning"),
		onToggleReaction: (emoji: ReactionEmoji) => run(() => bound.onToggleReaction(emoji), "your reaction"),
	};
}
