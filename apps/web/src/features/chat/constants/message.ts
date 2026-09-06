/**
 * What stands in for a message whose author deleted it.
 *
 * Rendered on the client rather than sent by the server, and that is not an
 * oversight: the server empties the row's content, so there is nothing left for
 * it to send. Putting the sentence in the payload would mean a deleted message
 * arriving with text in `content` again — the one field a client must be able to
 * trust is empty.
 */
export const DELETED_MESSAGE_TEXT = "This message was deleted";

/** Marker beside the timestamp of a message its author rewrote. */
export const EDITED_MESSAGE_LABEL = "edited";

/** Browsers clamp larger delays and may fire them immediately instead. */
export const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647;

/**
 * What stands in for the name of someone who deleted their account.
 *
 * The message survives them — deleting an account does not empty other people's
 * conversations — but the name does not: the server sets `author` to null rather
 * than keeping a copy of who it used to be, because holding on to the name of
 * somebody who asked to be erased is the opposite of what they asked for. So the
 * client needs something to put above the bubble, and this is it.
 */
export const DELETED_AUTHOR_NAME = "Deleted account";

/** What a picture with no caption says in the sidebar, where it cannot be shown. */
export const ATTACHMENT_PREVIEW_TEXT = "Sent an image";

/** A conversation that exists but has nothing in it yet — created, never used. */
export const EMPTY_CONVERSATION_TEXT = "No messages yet";

/** What a quoted image with no caption says, where the picture cannot be shown. */
export const IMAGE_ONLY_QUOTE_TEXT = "Photo";

/** How long the newest message's "Sent"/"Seen" caption stays up before it needs a hover like any other. */
export const SENT_CAPTION_WINDOW_MS = 60 * 60 * 1000;
