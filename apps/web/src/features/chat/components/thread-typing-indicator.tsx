import { TypingDots } from "./typing-dots";
import { cn } from "@/utils/cn";

interface ThreadTypingIndicatorProps {
	typingMessage: string | null;
	isGroup: boolean;
}

export function ThreadTypingIndicator({ typingMessage, isGroup }: ThreadTypingIndicatorProps) {
	return (
		<div className="thread-typing" data-active={Boolean(typingMessage)} aria-hidden={!typingMessage}>
			<div className="min-h-0 overflow-hidden">
				<div className="flex min-w-0 items-center gap-2 px-3 pb-3 pt-1 sm:px-5 md:px-8">
					<span className="ml-10 flex h-8 w-12 shrink-0 items-center justify-center rounded-message bg-paper-sunken text-ink-soft sm:ml-11">
						<TypingDots />
					</span>
					<span
						role="status"
						aria-label="Typing activity"
						aria-live="polite"
						aria-atomic="true"
						className={cn("truncate text-[11px] text-ink-soft", !isGroup && "sr-only")}
					>
						{isGroup ? typingMessage?.replace(/…$/, "") : typingMessage}
					</span>
				</div>
			</div>
		</div>
	);
}
