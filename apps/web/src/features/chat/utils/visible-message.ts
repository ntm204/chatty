import type { ThreadMessage } from "../types/thread-message";
import { isDraftId } from "./build-draft-message";

/** A clipped sliver does not count; tall messages count after a readable section is visible. */
export function findVisibleMessageId(container: HTMLElement, messages: ThreadMessage[]): string | undefined {
	const viewport = container.getBoundingClientRect();
	if (viewport.width <= 0 || viewport.height <= 0) return;
	const top = Math.max(viewport.top, 0);
	const bottom = Math.min(viewport.bottom, window.innerHeight);
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]!;
		if (isDraftId(message.id) || message.deliveryState) continue;
		const row = document.getElementById(`message-${message.id}`);
		if (!row || !container.contains(row)) continue;
		const bounds = row.getBoundingClientRect();
		const visibleHeight = Math.min(bounds.bottom, bottom) - Math.max(bounds.top, top);
		if (bounds.width > 0 && bounds.height > 0 && visibleHeight >= Math.min(48, bounds.height)) return message.id;
	}

	return undefined;
}
