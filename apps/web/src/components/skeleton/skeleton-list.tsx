import { SKELETON_DELAY_MS } from "@/constants/loading";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/utils/cn";

interface SkeletonListProps {
	/** Read to assistive technology in place of the shapes. */
	label: string;
	rows?: number;
	/** Settings lists use a smaller face than the inbox. */
	isCompact?: boolean;
	className?: string;
}

/**
 * Placeholder rows shaped like the list that is loading — a round face and two
 * lines — so the layout does not jump when the real rows arrive. Renders
 * nothing for the first `SKELETON_DELAY_MS`, so a fast load never flashes it.
 */
export function SkeletonList({ label, rows = 6, isCompact = false, className }: SkeletonListProps) {
	const isShown = useDelayedFlag(true, SKELETON_DELAY_MS);
	if (!isShown) return null;

	return (
		<div role="status" className={cn("flex flex-col gap-1 px-2 py-2", className)}>
			<span className="sr-only">{label}</span>
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} aria-hidden="true" className="flex items-center gap-3 px-2.5 py-2">
					<span className={cn("skeleton shrink-0 rounded-full", isCompact ? "size-8" : "size-11")} />
					<span className="flex min-w-0 flex-1 flex-col gap-2">
						<span className="skeleton h-3 rounded-full" style={{ width: `${48 + ((index * 17) % 30)}%` }} />
						<span
							className="skeleton h-2.5 rounded-full"
							style={{ width: `${62 + ((index * 23) % 28)}%` }}
						/>
					</span>
				</div>
			))}
		</div>
	);
}
