import type { MessageProtectionDTO } from "@chatty/shared-types";

/** What waits behind a protected message's cover, without saying what it says. */
export function describeProtectedContent(protection: MessageProtectionDTO): string {
	if (protection.imageCount > 1) return `${String(protection.imageCount)} photos`;
	if (protection.imageCount === 1) return protection.hasText ? "Photo and message" : "Photo";

	return "Message";
}

/**
 * The author's view of who has opened it. A direct conversation has one
 * recipient, so it is "Opened" or not; a group counts against everyone else.
 */
export function describeProtectedStatus(protection: MessageProtectionDTO, participantCount: number): string {
	const opened = protection.openedByUserIds.length;
	const audience = Math.max(participantCount - 1, 1);
	if (opened === 0) return "Not opened yet";
	if (audience === 1) return "Opened";

	return `Opened by ${String(opened)} of ${String(audience)}`;
}
