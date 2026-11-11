import { useCallback, useState } from "react";
import { MAX_RECENT_EMOJI, RECENT_EMOJI_STORAGE_KEY } from "../constants/emoji";

function readStored(): string[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(RECENT_EMOJI_STORAGE_KEY) ?? "[]");

		// Validated rather than trusted: this is a string somebody can edit, and a
		// picker that throws on a malformed value is worse than one that forgets.
		return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string") : [];
	} catch {
		// Unparseable, or storage that throws on access — a private window, or a
		// browser set to block site data.
		return [];
	}
}

/**
 * The emoji this browser reached for last, most recent first.
 *
 * Per-browser rather than per-account, the same call the notification setting
 * makes: it is a convenience local to the keyboard somebody is typing on, and
 * syncing it would mean a write to the server on every emoji inserted.
 */
export function useRecentEmoji(): { recent: string[]; remember: (char: string) => void } {
	const [recent, setRecent] = useState<string[]>(readStored);

	const remember = useCallback((char: string) => {
		setRecent((current) => {
			// Moved to the front rather than counted: "what I just used" is what the
			// row is for, and a frequency ranking would leave a months-old favourite
			// sitting where today's is expected.
			const next = [char, ...current.filter((entry) => entry !== char)].slice(0, MAX_RECENT_EMOJI);

			try {
				localStorage.setItem(RECENT_EMOJI_STORAGE_KEY, JSON.stringify(next));
			} catch {
				// The row still works for the rest of this session.
			}

			return next;
		});
	}, []);

	return { recent, remember };
}
