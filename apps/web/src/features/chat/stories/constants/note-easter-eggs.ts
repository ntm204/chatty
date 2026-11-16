import type { NoteEasterEggMeta, NoteEasterEggType } from "../types/note-easter-eggs";

export const NOTE_EASTER_EGGS: Record<NoteEasterEggType, NoteEasterEggMeta> = {
	snow: {
		type: "snow",
		label: "Falling Snow",
		emoji: "❄️",
		keywords: ["snow", "winter", "cold", "ice", "freeze", "tuyết", "lạnh", "mùa đông"],
	},
	heart: {
		type: "heart",
		label: "Floating Hearts",
		emoji: "💖",
		keywords: ["love", "heart", "crush", "sweet", "cute", "yêu", "thương", "tim", "crush"],
	},
	party: {
		type: "party",
		label: "Confetti Celebration",
		emoji: "🎉",
		keywords: ["party", "celebrate", "birthday", "congrats", "yay", "chúc mừng", "sinh nhật", "quẩy"],
	},
	fire: {
		type: "fire",
		label: "Flame Ember",
		emoji: "🔥",
		keywords: ["fire", "lit", "hot", "flame", "cháy", "nóng", "bùng nổ"],
	},
	coffee: {
		type: "coffee",
		label: "Morning Steam",
		emoji: "☕",
		keywords: ["coffee", "morning", "tea", "cà phê", "cf", "sáng"],
	},
	star: {
		type: "star",
		label: "Starlight Magic",
		emoji: "✨",
		keywords: ["star", "sparkle", "magic", "night", "sao", "lấp lánh", "đêm"],
	},
	music: {
		type: "music",
		label: "Melodic Vibe",
		emoji: "🎵",
		keywords: ["music", "vibe", "lofi", "chill", "nhạc", "song"],
	},
};

export const NOTE_PARTICLES_CONFIG: Record<NoteEasterEggType, { symbols: string[]; count: number }> = {
	snow: { symbols: ["❄️", "❅", "•", "❄️"], count: 6 },
	heart: { symbols: ["💖", "💕", "🤍", "✨"], count: 5 },
	party: { symbols: ["🎉", "🎊", "✨", "🎈"], count: 6 },
	fire: { symbols: ["🔥", "✨", "⚡", "🔥"], count: 5 },
	coffee: { symbols: ["☕", "♨️", "✨", "☁️"], count: 4 },
	star: { symbols: ["✨", "⭐", "🌟", "✨"], count: 6 },
	music: { symbols: ["🎵", "🎶", "♩", "♪"], count: 5 },
};
