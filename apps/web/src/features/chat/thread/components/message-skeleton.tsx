import { SKELETON_DELAY_MS } from "@/constants/loading";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/utils/cn";
import { MESSAGE_SKELETON_BUBBLES } from "../constants/message-row";

/** Bubble-shaped placeholders while a conversation's first page loads; hidden for a fast load. */
export function MessageSkeleton() {
	const isShown = useDelayedFlag(true, SKELETON_DELAY_MS);
	if (!isShown) return null;

	return (
		<div role="status" className="flex flex-col gap-2 px-3 pb-4 sm:px-5 md:px-8">
			<span className="sr-only">Loading messages</span>
			{MESSAGE_SKELETON_BUBBLES.map((bubble, index) => (
				<span
					key={index}
					aria-hidden="true"
					className={cn("skeleton h-9 rounded-[18px]", bubble.isMine ? "self-end" : "self-start")}
					style={{ width: bubble.width }}
				/>
			))}
		</div>
	);
}
