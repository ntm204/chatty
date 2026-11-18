import { Button } from "@/components/button";
import type { RadioListOption } from "@/types/radio-list";
import { cn } from "@/utils/cn";

interface RadioListProps<Value> {
	options: RadioListOption<Value>[];
	value: Value;
	onChange: (value: Value) => void;
	/** The id of the heading this group answers to. */
	labelledBy: string;
}

/**
 * Instagram's settings choice: one full-width row per option, the words on the
 * left and a round mark on the right. Room for a sentence under each option,
 * which a segmented control has no space for.
 */
export function RadioList<Value>({ options, value, onChange, labelledBy }: RadioListProps<Value>) {
	return (
		<div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col">
			{options.map((option) => {
				const isChecked = option.value === value;

				return (
					<Button
						key={option.label}
						variant="ghost"
						role="radio"
						aria-checked={isChecked}
						onClick={() => onChange(option.value)}
						className="h-auto w-full justify-between gap-4 rounded-control px-3 py-3 text-left font-normal"
					>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="text-[15px] text-ink">{option.label}</span>
							{option.description && (
								<span className="text-[13px] leading-snug text-ink-faint">{option.description}</span>
							)}
						</span>
						<span
							aria-hidden="true"
							className={cn(
								"flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
								isChecked ? "border-ink" : "border-rule-hover",
							)}
						>
							{isChecked && <span className="size-3 rounded-full bg-ink" />}
						</span>
					</Button>
				);
			})}
		</div>
	);
}
