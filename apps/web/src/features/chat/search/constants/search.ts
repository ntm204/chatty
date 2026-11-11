/**
 * How long to wait after the last keystroke before searching.
 *
 * Long enough that typing a word is one request rather than five, short enough
 * that it still feels like it is answering as you type. Below roughly 200ms the
 * saving disappears; above roughly 500ms it starts to feel broken.
 */
export const MESSAGE_SEARCH_DEBOUNCE_MS = 300;

/**
 * Shortest query worth sending.
 *
 * Matches the server's own minimum, and is the same number for the same reason:
 * a single character matches a large share of every message ever sent, so the
 * request is expensive and the answer is useless. Enforced on both sides because
 * the client's copy saves the round trip and the server's is the one that counts.
 */
export const MESSAGE_SEARCH_MIN_LENGTH = 2;
