import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

interface MessageSelectCheckProps {
	isSelected: boolean;
}

/** The round check beside each message while selecting, filled once picked. */
export function MessageSelectCheck({ isSelected }: MessageSelectCheckProps) {
	return (
		<span
			role="img"
			aria-label={isSelected ? "Selected" : "Not selected"}
			className={cn(
				"grid size-5 shrink-0 place-items-center self-center rounded-full border-2 transition-colors",
				isSelected ? "border-heading bg-heading text-paper-raised" : "border-rule bg-paper-raised",
			)}
		>
			{isSelected && <Check aria-hidden="true" className="size-3" strokeWidth={3} />}
		</span>
	);
}
