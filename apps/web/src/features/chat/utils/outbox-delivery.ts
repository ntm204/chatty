/**
 * A tab can have both the visible thread and the app-wide replay looking at
 * the same durable command. Keep that command single-flight before either
 * caller reaches HTTP; the server-side client id remains the cross-tab guard.
 */
const claimedDeliveryKeys = new Set<string>();

function deliveryKey(userId: string, messageId: string): string {
	return `${userId}:${messageId}`;
}

export function claimOutboxDelivery(userId: string, messageId: string): boolean {
	const key = deliveryKey(userId, messageId);
	if (claimedDeliveryKeys.has(key)) return false;

	claimedDeliveryKeys.add(key);

	return true;
}

export function releaseOutboxDelivery(userId: string, messageId: string): void {
	claimedDeliveryKeys.delete(deliveryKey(userId, messageId));
}
