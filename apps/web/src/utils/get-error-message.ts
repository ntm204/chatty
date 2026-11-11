import { ApiError, NetworkUnavailableError } from "@/api/core";
import { UserFacingError } from "@/lib/user-facing-error";

/**
 * What to show for a failed action: the server's own words when they were
 * written for people (a 4xx message, the offline notice, a `UserFacingError`), otherwise the
 * caller's fallback — which should say what to do next. Raw status lines,
 * stack-ish messages and 5xx internals never reach the screen.
 */
export function getErrorMessage(caught: unknown, fallback: string): string {
	if (caught instanceof NetworkUnavailableError || caught instanceof UserFacingError) return caught.message;
	if (caught instanceof ApiError && caught.hasUserMessage) return caught.message;

	return fallback;
}
