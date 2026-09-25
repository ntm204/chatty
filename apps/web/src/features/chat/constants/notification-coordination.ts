/** A per-account channel keeps separate signed-in accounts from competing. */
export const NOTIFICATION_COORDINATION_CHANNEL_PREFIX: string = "chatty:notification-coordination:";

/** A short-lived receipt also covers a socket event that reaches a tab late. */
export const NOTIFICATION_RECEIPT_STORAGE_PREFIX: string = "chatty:notification-receipt:";

/** Receipts only need to outlive delayed delivery, not become message history. */
export const NOTIFICATION_RECEIPT_TTL_MS: number = 2 * 60 * 1000;

/** A fallback claim waits briefly so simultaneous storage writes settle. */
export const NOTIFICATION_CLAIM_TTL_MS: number = 1_000;

/** BroadcastChannel has no atomic claim, so give every visible peer one turn. */
export const NOTIFICATION_BROADCAST_CLAIM_DELAY_MS: number = 50;
