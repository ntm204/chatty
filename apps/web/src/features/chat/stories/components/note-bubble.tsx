import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface NoteBubbleProps {
	/** Your note wears your message colour, everyone else's the received one — as in a chat. */
	isMine: boolean;
	size: "sm" | "lg";
	className?: string;
	children: ReactNode;
}

/**
 * A note is a message said to everyone, so it wears the message bubble: the same
 * corners, colours and tail (bubbles.css), not a thought cloud of its own.
 */
export function NoteBubble({ isMine, size, className, children }: NoteBubbleProps) {
	return (
		<div
			className={cn(
				"note-bubble rounded-message chat-bubble-tail",
				isMine ? "chat-bubble-mine bg-block text-block-ink" : "chat-bubble-theirs bg-paper-sunken text-ink",
				size === "sm" ? "note-bubble-sm px-2.5 py-1" : "px-5 py-4",
				className,
			)}
		>
			{children}
		</div>
	);
}
