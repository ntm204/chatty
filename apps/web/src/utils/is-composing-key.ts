import type { KeyboardEvent } from "react";

/** Safari may finish composition just before dispatching its final Enter (229). */
export function isComposingKey(event: KeyboardEvent): boolean {
	return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}
