import { MAX_REMEMBERED_READING_POSITIONS } from "../constants/pagination";

export interface ReadingPosition {
	messageId: string;
	/** Distance from the viewport top to the anchor row, in pixels. */
	offset: number;
}

// In memory for the tab's lifetime: switching threads returns the reader to the
// row they left, while a reload starts every thread fresh at its latest message.
const positions = new Map<string, ReadingPosition>();

export function rememberReadingPosition(scope: string, position: ReadingPosition | null) {
	positions.delete(scope);
	if (!position) return;
	positions.set(scope, position);
	if (positions.size > MAX_REMEMBERED_READING_POSITIONS) {
		const oldest = positions.keys().next().value;
		if (oldest !== undefined) positions.delete(oldest);
	}
}

export function recallReadingPosition(scope: string): ReadingPosition | null {
	return positions.get(scope) ?? null;
}

export function forgetReadingPositions() {
	positions.clear();
}
