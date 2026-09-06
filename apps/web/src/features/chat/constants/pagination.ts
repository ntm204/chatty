/** How many messages to fetch per page. Must not exceed the server's cap of 100. */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * How close to the top counts as "wants older messages".
 *
 * Not zero: waiting for an exact top hit means the reader stares at a blank gap
 * while the request runs. Loading slightly early hides the latency.
 */
export const LOAD_OLDER_THRESHOLD_PX = 120;

/** Leaving the live edge stops automatic following and exposes the same way back. */
export const LATEST_MESSAGE_THRESHOLD_PX = 120;

/** Return a little closer than the exit distance so the control does not flicker. */
export const RETURN_TO_LATEST_THRESHOLD_PX = 80;

/**
 * How many messages the thread keeps in memory before dropping the oldest.
 *
 * Four pages. This is the answer to "virtualise the message list once histories
 * get long" (roadmap item 76), and it is deliberately not windowing: the cost
 * that actually grows in this app is React reconciling an array that only ever
 * gets longer as somebody scrolls back through a year of conversation, and
 * windowing does not shrink that array — it only stops drawing part of it, at
 * the price of a rewrite of scroll anchoring, jump-to-message and the unread
 * divider, all of which currently work.
 *
 * Bounding the array fixes the cost at its source and reuses machinery that is
 * already here and already tested: dropping the oldest page is the exact inverse
 * of `loadOlder`, and scrolling back up re-fetches it through the path that put
 * it there. The reader cannot tell, because it only ever happens while they are
 * sitting at the bottom of the thread.
 *
 * Four rather than two: the trim has to leave enough above the viewport that
 * scrolling up does not immediately hit the top and re-fetch what was just
 * dropped, on a loop.
 */
export const MAX_RETAINED_MESSAGES = MESSAGE_PAGE_SIZE * 4;
