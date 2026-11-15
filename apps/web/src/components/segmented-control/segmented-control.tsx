import { Button } from "@/components/button";
import type { SegmentedOption } from "@/types/segmented-control";
import { cn } from "@/utils/cn";

interface SegmentedControlProps<Value> {
	options: SegmentedOption<Value>[];
	value: Value;
	onChange: (value: Value) => void;
	/** The id of the visible label this group answers to. */
	labelledBy: string;
	isDisabled?: boolean;
}

/**
 * A few mutually exclusive choices on one quiet track — the selected one lifts,
 * the rest stay as text. One row, no borders per option: a set of outlined pills
 * wraps onto two lines in a narrow panel and reads as four separate buttons
 * rather than one setting.
 */
export function SegmentedControl<Value>({
	options,
	value,
	onChange,
	labelledBy,
	isDisabled = false,
}: SegmentedControlProps<Value>) {
	return (
		<div
			role="radiogroup"
			aria-labelledby={labelledBy}
			aria-disabled={isDisabled || undefined}
			className="inline-flex max-w-full self-start rounded-full bg-paper-sunken p-0.5"
		>
			{options.map((option) => {
				const isSelected = option.value === value;

				return (
					<Button
						key={option.label}
						variant="ghost"
						role="radio"
						aria-checked={isSelected}
						aria-label={option.accessibleLabel}
						disabled={isDisabled}
						onClick={() => {
							if (!isSelected) onChange(option.value);
						}}
						className={cn(
							"h-7 whitespace-nowrap rounded-full px-3 text-[12px] font-medium",
							isSelected
								? "bg-paper-raised text-ink shadow-sm hover:bg-paper-raised"
								: "text-ink-soft hover:bg-transparent hover:text-ink",
						)}
					>
						{option.label}
					</Button>
				);
			})}
		</div>
	);
}
