import type { EditMessageRequest, SendMessageRequest, ToggleReactionRequest } from "@chatty/shared-types";
import { z } from "zod";

/**
 * `content` is optional because a message may be only an image. It cannot be
 * required-or-absent-depending-on-the-file here: the file arrives as
 * `req.file`, not in the body, and a body schema cannot see it. The controller
 * makes that call, at the same boundary.
 */
export const sendMessageSchema = z.object({
	content: z.string().max(4000).optional(),
	// Validated as a string here and as a real message in the service: whether
	// this id names a message in *this* conversation is not something a body
	// schema can see, and it is the half that matters — see `sendMessage`.
	replyToId: z.string().min(1).optional(),
	// Validated as a string here and as one of *your own* stickers in the
	// service: whether this id is in the caller's tray is not something a body
	// schema can see, and it is the half that matters.
	stickerId: z.string().min(1).max(64).optional(),
	forwardOfMessageId: z.string().min(1).max(64).optional(),
	// A device-generated idempotency key. The service scopes it to the author;
	// the length bound also caps the unique-index key stored by PostgreSQL.
	clientId: z.string().min(1).max(64).optional(),
	mentionedUserIds: z.preprocess(
		(value) => {
			if (typeof value !== "string") return value;
			try {
				return JSON.parse(value) as unknown;
			} catch {
				return value;
			}
		},
		z.array(z.string().min(1).max(64)).max(50).optional(),
	),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Same compile-time contract check the auth schemas carry — see auth.schema.ts. */
type AssertAssignable<Actual extends Expected, Expected> = Actual;
export type SendMessageContract = AssertAssignable<SendMessageInput, SendMessageRequest>;

/**
 * `content` is required here where sending makes it optional, and the asymmetry
 * is the point: a send may carry only a file, an edit never carries one. The
 * emptiness rule still cannot live in this schema — whether "" is allowed
 * depends on the stored message having an image, which no body schema can see —
 * so the service decides it, the same way the controller decides it on send.
 */
export const editMessageSchema = z.object({
	content: z.string().max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export type EditMessageContract = AssertAssignable<EditMessageInput, EditMessageRequest>;

/**
 * Exactly one fully-qualified RGI emoji, and nothing else.
 *
 * This one regex is what lets the column be a free string without "the same
 * reaction" becoming undecidable. `\p{RGI_Emoji}` matches the emoji the Unicode
 * standard says are actually recommended for interchange, in their qualified
 * spelling only — so `❤️` (U+2764 U+FE0F) is a reaction and the bare `❤`
 * (U+2764) is a 400. Without that, two clients could store two rows for one
 * heart and every count on the message would be wrong.
 *
 * Anchored, so a message-length string of emoji is refused too: a reaction is
 * one mark. `👍🏽` and the family sequences pass, which is the point of using the
 * property of *strings* rather than a code-point class.
 *
 * Built with `new RegExp` rather than a literal because the `v` flag needs an
 * ES2024 target and `tsconfig.base.json` sets ES2022 for both apps. Node 22 —
 * which `engines` already requires — has supported it since 20, so this is a
 * compiler limit rather than a runtime one, and bumping the shared target to
 * work around one regex would change the emit for the web bundle too.
 */
export const SINGLE_RGI_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

export const toggleReactionSchema = z.object({
	// `max` before the regex so a hostile megabyte is rejected on its length
	// rather than run through a Unicode property match.
	emoji: z.string().max(64).regex(SINGLE_RGI_EMOJI, "Must be a single emoji"),
});
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

export type ToggleReactionContract = AssertAssignable<ToggleReactionInput, ToggleReactionRequest>;

export const listMessagesQuerySchema = z
	.object({
		// cursor-based pagination: pass the id of the oldest message you already
		// have to get the next page going further back
		before: z.string().optional(),
		after: z.string().optional(),
		limit: z.coerce.number().min(1).max(100).default(50),
	})
	.refine((query) => !(query.before && query.after), { message: "Use either before or after, not both" });
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageContextQuerySchema = z.object({
	limit: z.coerce.number().min(10).max(100).default(50),
});
export type MessageContextQuery = z.infer<typeof messageContextQuerySchema>;
