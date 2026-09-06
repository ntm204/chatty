import { ArrowDown, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { TypingDots } from "./typing-dots";

interface ScrollToLatestButtonProps {
	isVisible: boolean;
	isLoading?: boolean;
	newMessageCount: number;
	onClick: () => void;
	typingMessage?: string | null;
}

/** A small visible surface inside a forgiving touch target; only real typing loops. */
export function ScrollToLatestButton({
	isVisible,
	isLoading = false,
	newMessageCount,
	onClick,
	typingMessage,
}: ScrollToLatestButtonProps) {
	const detailsRef = useRef<HTMLSpanElement>(null);
	const [detailsWidth, setDetailsWidth] = useState(0);
	const activeTypingMessage = typingMessage?.trim() || null;
	const hasNewMessages = newMessageCount > 0;
	const hasActivity = Boolean(isLoading || activeTypingMessage || hasNewMessages);
	const newMessageDescription = hasNewMessages
		? `${newMessageCount} new ${newMessageCount === 1 ? "message" : "messages"}`
		: null;
	const activityDescription = isLoading
		? "Loading latest messages"
		: [activeTypingMessage, newMessageDescription].filter(Boolean).join(". ") || "You are viewing earlier messages";
	const newMessageLabel = newMessageCount > 99 ? "99+" : newMessageCount;

	useLayoutEffect(() => {
		const details = detailsRef.current;
		if (!details) return;
		// Measure the intrinsic label, not the animated button: typing names, counts
		// and viewport changes can all change its width without restarting entry.
		const measure = () => setDetailsWidth(details.getBoundingClientRect().width);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(details);

		return () => observer.disconnect();
	}, [hasActivity, isLoading, activeTypingMessage, newMessageCount]);

	return (
		<>
			<Button
				variant="ghost"
				aria-label="Jump to latest messages"
				aria-description={activityDescription}
				aria-hidden={!isVisible}
				aria-busy={isLoading || undefined}
				tabIndex={isVisible ? 0 : -1}
				disabled={!isVisible || isLoading}
				title={isLoading ? "Loading latest messages…" : "Jump to latest"}
				onClick={onClick}
				data-visible={isVisible}
				style={{ width: 44 + detailsWidth }}
				className="scroll-latest group absolute bottom-1.5 left-1/2 z-20 h-11 min-w-11 max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 gap-0 rounded-full bg-transparent p-1.5 font-medium text-ink-soft hover:bg-transparent hover:text-ink disabled:cursor-default disabled:opacity-100"
			>
				<span
					data-scroll-latest-surface
					className="flex h-8 w-full items-center overflow-hidden rounded-full border border-rule bg-paper-raised shadow-reaction transition-colors group-hover:border-ink-faint/50"
				>
					<span className="grid size-[30px] shrink-0 place-items-center" aria-hidden="true">
						{isLoading ? (
							<LoaderCircle className="size-3.5 motion-safe:animate-spin" />
						) : (
							<ArrowDown
								className={cn("scroll-latest-arrow size-3.5", hasNewMessages && "text-signal")}
							/>
						)}
					</span>
					<span
						ref={detailsRef}
						aria-hidden="true"
						className={cn(
							"flex w-max shrink-0 items-center gap-2 whitespace-nowrap",
							hasActivity && "pr-2.5",
						)}
					>
						{isLoading ? (
							<span className="text-[11px]">Loading latest…</span>
						) : (
							<>
								{activeTypingMessage && (
									<span className="flex items-center gap-1.5">
										<span className="max-w-[min(13rem,40cqw)] truncate text-[11px]">
											{activeTypingMessage.replace(/…$/, "")}
										</span>
										<TypingDots />
									</span>
								)}
								{hasNewMessages && (
									<span
										className={cn(
											"meta text-ink",
											activeTypingMessage && "border-l border-rule pl-2",
										)}
									>
										{newMessageLabel} new
										{!activeTypingMessage && (newMessageCount === 1 ? " message" : " messages")}
									</span>
								)}
							</>
						)}
					</span>
				</span>
			</Button>
			{/* Announce arrivals once, without reading the thread or every typing tick. */}
			<span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
				{isVisible && (isLoading ? "Loading latest messages" : newMessageDescription)}
			</span>
		</>
	);
}
