import { NOTE_PARTICLES_CONFIG } from "../constants/note-easter-eggs";
import type { NoteEasterEggType } from "../types/note-easter-eggs";
import { cn } from "@/utils/cn";

interface NoteEasterEggParticlesProps {
	type: NoteEasterEggType;
	className?: string;
}

/**
 * Ambient floating particle effect triggered by trending keywords.
 */
export function NoteEasterEggParticles({ type, className }: NoteEasterEggParticlesProps) {
	const config = NOTE_PARTICLES_CONFIG[type];

	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-inherit select-none",
				className,
			)}
		>
			{config.symbols.map((symbol, index) => {
				const leftPosition = 12 + ((index * 22) % 76);
				const delaySeconds = (index * 0.35) % 1.8;
				const durationSeconds = 2.4 + (index % 3) * 0.4;

				return (
					<span
						key={index}
						style={{
							left: `${leftPosition}%`,
							animationDelay: `${delaySeconds}s`,
							animationDuration: `${durationSeconds}s`,
						}}
						className={cn(
							"absolute text-xs opacity-0 transition-opacity",
							type === "snow" ? "animate-bounce -top-1" : "animate-pulse bottom-1",
						)}
					>
						{symbol}
					</span>
				);
			})}
		</div>
	);
}
