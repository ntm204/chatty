import { Pin } from "lucide-react";
import { cn } from "@/utils/cn";

interface MessagePinBadgeProps {
	isMine: boolean;
}

/** A pinned message's mark, on the bubble's outer top corner — seen while scrolling, not only in the banner. */
export function MessagePinBadge({ isMine }: MessagePinBadgeProps) {
	return (
		<span
			role="img"
			aria-label="Pinned"
			className={cn(
				"absolute -top-1.5 z-2 grid size-5 place-items-center rounded-full bg-paper-raised text-heading shadow-sm",
				isMine ? "-left-1.5" : "-right-1.5",
			)}
		>
			<Pin aria-hidden="true" className="size-3 rotate-45" />
		</span>
	);
}
