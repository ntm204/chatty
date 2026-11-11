import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
	title: string;
	description?: string;
	/** One next step, so an empty screen is never a dead end. */
	action?: ReactNode;
	className?: string;
}

/** A short, centred title, an optional line and a next step — at most 320px wide. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
	return (
		<div
			role="status"
			className={cn("mx-auto flex max-w-80 flex-col items-center gap-1 px-5 py-8 text-center", className)}
		>
			<p className="text-sm font-semibold text-ink">{title}</p>
			{description && <p className="text-xs text-ink-faint">{description}</p>}
			{action && <div className="mt-3">{action}</div>}
		</div>
	);
}
