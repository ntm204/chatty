import { cn } from "@/utils/cn";

interface StoryProgressProps {
	count: number;
	activeIndex: number;
	isPaused: boolean;
	/** How long the active story runs: a video's own length, five seconds otherwise. */
	durationMs: number;
	/** Fires when the active segment fills — the cue to move on. */
	onComplete: () => void;
}

/**
 * One segment per story of this person. The active one fills by a CSS
 * animation rather than a JavaScript timer, so pausing is `animation-play-state`
 * and the tab being in the background costs nothing; its end is the advance.
 */
export function StoryProgress({ count, activeIndex, isPaused, durationMs, onComplete }: StoryProgressProps) {
	return (
		<div className="flex gap-1" aria-hidden="true">
			{Array.from({ length: count }, (_, index) => (
				<span key={index} className="h-[3px] flex-1 overflow-hidden rounded-full bg-on-media/35">
					<span
						key={index === activeIndex ? `active-${activeIndex}` : index}
						onAnimationEnd={index === activeIndex ? onComplete : undefined}
						className={cn(
							"block h-full origin-left rounded-full bg-on-media",
							index < activeIndex && "scale-x-100",
							index > activeIndex && "scale-x-0",
							index === activeIndex && "story-progress-fill",
						)}
						style={
							index === activeIndex
								? {
										animationDuration: `${durationMs}ms`,
										animationPlayState: isPaused ? "paused" : "running",
									}
								: undefined
						}
					/>
				</span>
			))}
		</div>
	);
}
