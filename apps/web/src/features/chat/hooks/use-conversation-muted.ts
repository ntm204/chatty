import { useMuteExpiry } from "./use-mute-expiry";

/** Refresh at the deadline even when no socket event causes another render. */
export function useConversationMuted(mutedUntil: string | null): boolean {
	useMuteExpiry([mutedUntil]);
	const expiresAt = mutedUntil ? Date.parse(mutedUntil) : 0;

	return expiresAt > Date.now();
}
