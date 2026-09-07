import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label: string;
	error?: string;
}

/** Shared fields keep an ink edge, a colored focus shadow and linked error text. */
export function TextField({ label, error, className, ...rest }: TextFieldProps) {
	// useId, not a prop: two TextFields on one page must not share an id, or
	// clicking one label focuses the other's input.
	const inputId = useId();

	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={inputId} className="eyebrow text-ink-soft">
				{label}
			</label>
			<input
				id={inputId}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? `${inputId}-error` : undefined}
				className={cn(
					"text-field rounded-control border bg-paper-raised px-3 py-2.5 text-sm text-ink outline-none transition",
					"placeholder:text-ink-faint",
					// A field that takes no input has to look like one. The group
					// panel disables the name field for non-admins, and without this
					// it is indistinguishable from an editable one.
					"disabled:bg-rule-soft disabled:text-ink-faint",
					error
						? "border-signal focus:ring-3 focus:ring-signal/10"
						: "border-rule focus:border-ink focus:ring-3 focus:ring-ink/[0.07]",
					className,
				)}
				{...rest}
			/>
			{error && (
				<p id={`${inputId}-error`} className="eyebrow text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
