import { AVATAR_GRADIENTS } from "@/constants/avatar-gradients";

/** The gradient for a seed (a user or conversation id): stable, spread evenly over the palette. */
export function getAvatarGradient(seed: string): string {
	let hash = 0;
	for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0;
	const [from, to] = AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;

	return `linear-gradient(135deg, ${from}, ${to})`;
}
