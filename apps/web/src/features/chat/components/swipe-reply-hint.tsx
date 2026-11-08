import { CornerUpLeft } from "lucide-react";
import type { CSSProperties } from "react";

interface SwipeReplyHintProps {
	/** 0 to 1: how close the drag is to replying. The arrow grows into place. */
	progress: number;
}

/** The reply arrow uncovered behind a bubble being swiped. */
export function SwipeReplyHint({ progress }: SwipeReplyHintProps) {
	return (
		<span aria-hidden="true" className="swipe-reply-hint" style={{ "--swipe-progress": progress } as CSSProperties}>
			<CornerUpLeft className="size-4" />
		</span>
	);
}
