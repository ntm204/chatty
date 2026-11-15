import { useSyncExternalStore } from "react";
import { TIME_LEFT_REFRESH_MS } from "../constants/message-row";

/**
 * One clock for every "time left" label on screen.
 *
 * A thread can hold two hundred disappearing messages; an interval each would
 * be two hundred timers and two hundred separate renders every tick. This is one
 * interval, started by the first subscriber and stopped with the last, and every
 * label reads the same instant.
 */
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	if (!timer) {
		now = Date.now();
		timer = setInterval(() => {
			now = Date.now();
			for (const notify of listeners) notify();
		}, TIME_LEFT_REFRESH_MS);
	}

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

export function useSharedClock(): number {
	return useSyncExternalStore(subscribe, () => now);
}
