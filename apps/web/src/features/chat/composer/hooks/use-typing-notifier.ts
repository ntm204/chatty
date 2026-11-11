import { useCallback, useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { TYPING_IDLE_MS, TYPING_REFRESH_MS } from "../../constants/typing";

interface TypingNotifier {
	/** Call on every keystroke. Throttled internally — it is not one event per key. */
	notifyTyping: () => void;
	/** Call when the message is sent, so the indicator clears immediately. */
	stopTyping: () => void;
}

/**
 * Announces that the signed-in user is typing in a conversation.
 *
 * Two things keep this from being one socket event per keypress. A start is
 * re-sent at most every TYPING_REFRESH_MS, which is enough to keep receivers
 * from timing the user out but far less than a person types; and a stop is sent
 * after TYPING_IDLE_MS of silence, so pausing to think clears the indicator
 * without the sender doing anything.
 *
 * All the bookkeeping sits in refs rather than state: none of it is rendered,
 * and holding it in state would re-render the input on every keystroke to no
 * visible effect.
 */
export function useTypingNotifier(conversationId: string): TypingNotifier {
	// 0 means "not currently announced as typing", which is what makes stopTyping
	// safe to call unconditionally — on submit, on unmount, on a switch away.
	const announcedAt = useRef(0);
	const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const stopTyping = useCallback(() => {
		clearTimeout(idleTimer.current);
		if (announcedAt.current === 0) return;

		announcedAt.current = 0;
		getSocket().emit("typing:stop", { conversationId });
	}, [conversationId]);

	const notifyTyping = useCallback(() => {
		const now = Date.now();

		if (now - announcedAt.current >= TYPING_REFRESH_MS) {
			getSocket().emit("typing:start", { conversationId });
			announcedAt.current = now;
		}

		clearTimeout(idleTimer.current);
		idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
	}, [conversationId, stopTyping]);

	// Switching conversations mid-sentence, or closing the tab, must retract the
	// announcement — otherwise the other side is left watching a "typing…" for a
	// message that will never arrive.
	useEffect(() => stopTyping, [stopTyping]);

	return { notifyTyping, stopTyping };
}
