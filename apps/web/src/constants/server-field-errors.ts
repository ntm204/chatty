/**
 * Server messages that are about one field. The server sends a sentence, not a
 * code, so the sentences are matched here — once — and every form maps the kind
 * onto its own field name. Anything not listed stays a form-level error.
 *
 * "Invalid email or password" is deliberately absent: it does not say which one,
 * so pinning it to either field would tell a guesser more than the server does.
 */
export const SERVER_FIELD_ERRORS: Record<string, ServerErrorField> = {
	"Handle already taken": "handle",
	"Email already registered": "email",
	"That is already the address on this account": "email",
	"Current password is incorrect": "currentPassword",
	"New password must be different from the current one": "newPassword",
};

export type ServerErrorField = "handle" | "email" | "currentPassword" | "newPassword";
