import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface SwitchProps {
	isOn: boolean;
	onChange: (isOn: boolean) => void;
	/** The accessible name — the visible label beside it says the same thing. */
	label: string;
	isDisabled?: boolean;
}

/**
 * An on/off setting that applies the moment it is flipped.
 *
 * The off track is `paper-sunken` and the knob `paper-raised`, not translucent
 * ink: an opacity fill and a raised knob both read as the panel's own surface in
 * dark mode, where ink is pale, and the two used to vanish into each other.
 * Hover restates each state's fill so a ghost button's hover wash cannot turn
 * a solid "on" track hollow under the pointer.
 */
export function Switch({ isOn, onChange, label, isDisabled = false }: SwitchProps) {
	return (
		<Button
			variant="ghost"
			role="switch"
			aria-checked={isOn}
			aria-label={label}
			disabled={isDisabled}
			onClick={() => onChange(!isOn)}
			className={cn(
				"relative h-5 w-9 shrink-0 rounded-full border p-0 transition-colors",
				isOn ? "border-ink bg-ink hover:bg-ink" : "border-rule bg-paper-sunken hover:bg-paper-sunken",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"absolute left-0.5 top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-paper-raised shadow-sm motion-safe:transition-transform",
					isOn ? "translate-x-4" : "translate-x-0",
				)}
			/>
		</Button>
	);
}
