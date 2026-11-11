import { ArrowUp } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/button";
import { useUnreadJump } from "../hooks/use-unread-jump";

interface JumpToUnreadButtonProps {
	threadRef: RefObject<HTMLElement>;
	dividerMessageId: string | null;
	count: number;
}

/** A pill at the top of the thread that takes the reader up to the first unread message, until they have seen it. */
export function JumpToUnreadButton({ threadRef, dividerMessageId, count }: JumpToUnreadButtonProps) {
	const { isJumpOffered, jump } = useUnreadJump(threadRef, dividerMessageId);
	if (!isJumpOffered || count === 0) return null;
	const label = `${count} new ${count === 1 ? "message" : "messages"}`;

	return (
		<Button
			variant="ghost"
			onClick={jump}
			aria-label={`Jump to ${label}`}
			className="jump-to-unread wallpaper-pill absolute left-1/2 z-20 h-8 -translate-x-1/2 gap-1.5 rounded-full px-3 text-xs font-semibold text-signal shadow-reaction hover:bg-transparent"
		>
			<ArrowUp aria-hidden="true" className="size-3.5" />
			{label}
		</Button>
	);
}
