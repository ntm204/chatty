export type NoteEasterEggType = "snow" | "heart" | "party" | "fire" | "coffee" | "star" | "music";

export interface NoteEasterEggMeta {
	type: NoteEasterEggType;
	label: string;
	emoji: string;
	keywords: string[];
}
