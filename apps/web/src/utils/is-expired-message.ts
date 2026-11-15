import type { MessageDTO } from "@chatty/shared-types";

/**
 * Whether a disappearing message's time is up on this device's clock.
 *
 * Every client surface checks this rather than waiting for the server's
 * `message:expired`: the server erases on a sweep a few seconds later, and a
 * message that is still on screen — or still in the local cache — after its
 * promised instant is the one failure people relying on it would notice.
 */
export function isExpiredMessage(message: Pick<MessageDTO, "expiresAt">, now = Date.now()): boolean {
	return message.expiresAt !== null && Date.parse(message.expiresAt) <= now;
}
