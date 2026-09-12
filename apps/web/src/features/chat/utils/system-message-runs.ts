import type { ThreadMessage } from "../types/thread-message";
import { hasMessageTimeGap, isNewDay } from "./index";

export const SYSTEM_MESSAGE_COLLAPSE_THRESHOLD = 3;

/** One linear pass; never hide a day, time or unread boundary inside a run. */
export function getSystemMessageRuns(messages: ThreadMessage[], unreadId: string | null) {
	const runs = new Map<number, ThreadMessage[]>();
	let run: ThreadMessage[] | undefined;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index]!;
		const previous = messages[index - 1];
		if (message.kind !== "system") {
			run = undefined;
			continue;
		}
		if (
			!run ||
			message.id === unreadId ||
			isNewDay(message.createdAt, previous?.createdAt) ||
			hasMessageTimeGap(message.createdAt, previous?.createdAt)
		) {
			run = [];
			runs.set(index, run);
		}
		run.push(message);
	}

	return runs;
}
