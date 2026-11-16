import { NOTE_EASTER_EGGS } from "../constants/note-easter-eggs";
import type { NoteEasterEggMeta } from "../types/note-easter-eggs";

const EASTER_EGG_LIST = Object.values(NOTE_EASTER_EGGS);

/**
 * Checks if note text triggers an authentic Instagram secret animation
 * (e.g., snow, hearts, fire, coffee, stars, confetti).
 */
export function detectNoteEasterEgg(text: string): NoteEasterEggMeta | null {
	if (!text) return null;
	const normalized = text.toLowerCase();
	for (const egg of EASTER_EGG_LIST) {
		for (const keyword of egg.keywords) {
			if (normalized.includes(keyword)) {
				return egg;
			}
		}
	}

	return null;
}
