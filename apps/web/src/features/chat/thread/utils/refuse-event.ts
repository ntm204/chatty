import type { SyntheticEvent } from "react";

/** Cancels a copy, cut, drag or context-menu event on content that must not leave the page that way. */
export function refuseEvent(event: SyntheticEvent): void {
	event.preventDefault();
}
