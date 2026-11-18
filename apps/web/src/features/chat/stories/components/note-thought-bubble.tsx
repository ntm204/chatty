import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface NoteThoughtBubbleProps {
	size: "sm" | "lg";
	/** The faint "Share a thought…" bubble on your own tile before you have a note. */
	isPlaceholder?: boolean;
	className?: string;
	children: ReactNode;
}

/**
 * Messenger's note bubble: a rounded card with two small circles trailing down
 * towards the face, the comic-strip sign for a thought rather than speech.
 */
export function NoteThoughtBubble({ size, isPlaceholder = false, className, children }: NoteThoughtBubbleProps) {
	const isSmall = size === "sm";

	return (
		<div className={cn("relative", isSmall ? "pb-1.5" : "pb-4", className)}>
			<div
				className={cn(
					"note-thought-bubble relative border border-rule-soft bg-paper-raised shadow-reaction",
					isSmall ? "rounded-[14px] px-2 py-1" : "rounded-3xl px-5 py-4",
					isPlaceholder ? "text-ink-faint" : "text-ink",
				)}
			>
				{children}
			</div>
			<span
				aria-hidden="true"
				className={cn(
					"absolute rounded-full border border-rule-soft bg-paper-raised shadow-reaction",
					isSmall ? "bottom-0.5 left-2.5 size-1.5" : "bottom-1 left-6 size-3.5",
				)}
			/>
			<span
				aria-hidden="true"
				className={cn(
					"absolute rounded-full border border-rule-soft bg-paper-raised shadow-reaction",
					isSmall ? "-bottom-0.5 left-1 size-1" : "-bottom-1.5 left-3.5 size-2",
				)}
			/>
		</div>
	);
}
