import { X } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface ConversationActionErrorProps {
	error: string;
	onDismiss: () => void;
	className?: string;
}

export function ConversationActionError({ error, onDismiss, className }: ConversationActionErrorProps) {
	return (
		<div
			role="alert"
			className={cn(
				"flex items-start gap-2 rounded-panel border border-rule bg-paper-raised p-2.5 text-xs text-signal",
				className,
			)}
		>
			<p className="min-w-0 flex-1 break-words">{error}</p>
			<Button
				variant="ghost"
				className="size-5 shrink-0 p-0"
				aria-label="Dismiss conversation error"
				onClick={onDismiss}
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}
