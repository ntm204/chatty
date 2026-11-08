import { DEV_LOGIN_DOMAIN } from "../constants/dev-login";

/**
 * What the sign-in form sends as the email.
 *
 * Development builds only: a value with no "@" is a seeded test account's
 * short name and gains `@test.com`. A production build sends exactly what was
 * typed, so the shortcut cannot reach a real deployment.
 */
export function toLoginEmail(value: string, isDevelopment: boolean = import.meta.env.DEV): string {
	const trimmed = value.trim();
	if (!isDevelopment || trimmed.includes("@")) return trimmed;

	return `${trimmed}@${DEV_LOGIN_DOMAIN}`;
}
