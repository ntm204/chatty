import type { MessageDTO } from "@chatty/shared-types";

/**
 * Whether a message the viewer wrote has reached the server yet.
 *
 * Absent on everything the server sent, which is every message except the one
 * this tab is in the middle of sending. That is why it is optional rather than
 * a `"delivered"` member: a delivered message is not a state the client tracks,
 * it is the absence of a send in flight.
 */
export type MessageDeliveryState = "pending" | "failed";

/**
 * A message as the thread renders it: the wire type, plus the one fact only the
 * sending tab knows.
 *
 * A superset rather than a wrapper, so every existing util — the cluster
 * grammar, the day rule, the read receipt — keeps working on it unchanged.
 */
export interface ThreadMessage extends MessageDTO {
	deliveryState?: MessageDeliveryState;
	hasLocalStorageError?: boolean;
}
