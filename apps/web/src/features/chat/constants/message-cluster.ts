import type { ClusterPosition } from "../types/message-cluster";

/** Messages farther apart than this start a new visual turn, even from the same author. */
export const MESSAGE_BURST_WINDOW_MS = 5 * 60 * 1_000;

/** A quiet hour deserves an explicit time marker inside the same calendar day. */
export const MESSAGE_TIME_GAP_MS = 60 * 60 * 1_000;

/**
 * The corner grammar for a run of messages.
 *
 * The outside edge keeps a continuous curve. On the sender's side, only corners
 * facing another message tighten, so a run has soft ends without a pointed tail.
 *
 * The all-corners class comes first in every string on purpose: tailwind-merge
 * lets a later single-corner utility override it, but not the reverse.
 */
export const OUTGOING_BUBBLE_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-message",
	first: "rounded-message rounded-br-message-join",
	middle: "rounded-message rounded-tr-message-join rounded-br-message-join",
	last: "rounded-message rounded-tr-message-join",
};

/** The same joins mirrored for received messages. */
export const INCOMING_BUBBLE_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-message",
	first: "rounded-message rounded-bl-message-join",
	middle: "rounded-message rounded-tl-message-join rounded-bl-message-join",
	last: "rounded-message rounded-tl-message-join",
};
