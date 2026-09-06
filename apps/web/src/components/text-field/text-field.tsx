import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label: string;
	error?: string;
}

/**
 * A label, a field, and the reason it is refusing.
 *
 * Focus is an ink ring rather than a blue glow — there is no blue in this app,
 * and the ring is the same weight as the border it thickens. The error sits
 * under the field in the same mono the label is set in, so a field and its
 * complaint speak in one voice.
 */
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
				className={cn(
					"rounded-control border bg-paper-raised px-3 py-2.5 text-sm text-ink outline-none transition",
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
			{error && <p className="eyebrow text-signal">{error}</p>}
		</div>
	);
}
