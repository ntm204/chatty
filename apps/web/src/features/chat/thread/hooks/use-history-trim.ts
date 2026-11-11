import { useEffect } from "react";
import { MAX_RETAINED_MESSAGES } from "../../constants/pagination";
import type { ThreadMessage } from "../../types/thread-message";

interface UseHistoryTrimOptions {
	messages: ThreadMessage[];
	isViewingHistory: boolean;
	isFarFromBottom: boolean;
	isJumpingToLatest: boolean;
	onTrimHistory: () => void;
}

/**
 * Drops the oldest loaded messages once the thread holds more than
 * `MAX_RETAINED_MESSAGES`, so a long session does not keep growing the DOM.
 * Three conditions, and each one is a way the reader would notice:
 *
 *  - **At the bottom, after navigation settles.** Trimming above somebody who
 *    is reading history would take the messages out from under them. Waiting
 *    until a smooth jump lands also keeps its moving destination stable.
 *  - **Not looking at a jumped-to message.** A search result opens the thread
 *    around an old message with newer ones still unloaded; the newest message
 *    is not on screen even though the scroll position says bottom.
 *  - **Nothing newer left to load**, which is the same situation seen from
 *    the other side.
 */
export function useHistoryTrim({
	messages,
	isViewingHistory,
	isFarFromBottom,
	isJumpingToLatest,
	onTrimHistory,
}: UseHistoryTrimOptions): void {
	useEffect(() => {
		if (messages.length <= MAX_RETAINED_MESSAGES) return;
		if (isViewingHistory || isFarFromBottom || isJumpingToLatest) return;

		onTrimHistory();
	}, [messages, isViewingHistory, isFarFromBottom, isJumpingToLatest, onTrimHistory]);
}
