import type { ClusterPosition } from "../types/message-row";
import { MESSAGE_BURST_WINDOW_MS, MESSAGE_TIME_GAP_MS } from "../constants/message-row";
import type { ThreadMessage } from "../../types/thread-message";
import { isNewDay } from "./format-day";

/**
 * Names the four cases the corner grammar is written against.
 *
 * A message that both opens and closes its run is `solo` rather than "first and
 * last": it is the only shape that carries a full set of round corners plus the
 * notch, and calling it by name is what stops the tables in
 * `constants/message-row` from needing a fifth row nobody would maintain.
 */
export function getClusterPosition(isFirstOfRun: boolean, isLastOfRun: boolean): ClusterPosition {
	if (isFirstOfRun && isLastOfRun) return "solo";
	if (isFirstOfRun) return "first";
	if (isLastOfRun) return "last";

	return "middle";
}

function getElapsedMs(isoTimestamp: string, previousIsoTimestamp: string): number {
	return Math.max(0, Date.parse(isoTimestamp) - Date.parse(previousIsoTimestamp));
}

/** Whether two adjacent messages are close enough to read as one burst. */
export function isWithinMessageBurst(isoTimestamp: string, previousIsoTimestamp: string | undefined): boolean {
	if (!previousIsoTimestamp) return false;

	return getElapsedMs(isoTimestamp, previousIsoTimestamp) <= MESSAGE_BURST_WINDOW_MS;
}

/** Whether a same-day pause is long enough to orient the reader again. */
export function hasMessageTimeGap(isoTimestamp: string, previousIsoTimestamp: string | undefined): boolean {
	if (!previousIsoTimestamp) return false;

	return getElapsedMs(isoTimestamp, previousIsoTimestamp) >= MESSAGE_TIME_GAP_MS;
}

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
