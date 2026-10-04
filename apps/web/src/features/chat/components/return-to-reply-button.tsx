import { CornerDownRight } from "lucide-react";
import { Button } from "@/components/button";

interface ReturnToReplyButtonProps {
	isLoading: boolean;
	onClick: () => void;
}

export function ReturnToReplyButton({ isLoading, onClick }: ReturnToReplyButtonProps) {
	return (
		<Button
			variant="ghost"
			aria-label="Back to reply"
			aria-description="Return to where you were reading before opening the original message"
			title="Back to reply"
			disabled={isLoading}
			onClick={onClick}
			className="group absolute bottom-1.5 right-3 z-20 size-11 rounded-full bg-transparent p-1.5 hover:bg-transparent"
		>
			<span className="grid size-8 place-items-center rounded-full border border-rule bg-paper-raised text-ink-soft shadow-reaction transition-colors group-hover:border-ink-faint/50 group-hover:text-ink">
				<CornerDownRight aria-hidden="true" className="size-3.5" />
			</span>
		</Button>
	);
}
