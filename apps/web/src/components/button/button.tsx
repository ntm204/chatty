import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { ButtonVariant } from "@/types/button";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	children: ReactNode;
}

/**
 * `type` defaults to "button", not to the HTML default of "submit".
 *
 * A `<button>` with no type inside a `<form>` submits it, and it also becomes a
 * candidate for *implicit* submission — pressing Enter in a text field activates
 * the form's first submit button, whatever that button was actually for. That
 * shipped as a real bug: attaching an image to a message and pressing Enter
 * instead of clicking send fired the preview's "Remove attached image" button
 * first, so the picture was dropped and a text-only message went out. Found by
 * the e2e suite; invisible to every unit test, because each one clicks the
 * button it means.
 *
 * Every genuine submit in this app already says `type="submit"` explicitly, so
 * this default costs nothing and closes the same trap in the other three forms.
 *
 * `danger` is outlined rather than filled, and that is the decision rather than
 * the style: a solid red block invites the click it exists to slow down.
 */
export function Button({ variant = "primary", type = "button", className, children, ...rest }: ButtonProps) {
	return (
		<button
			type={type}
			data-variant={variant}
			// `className` comes last so a caller's utility beats the defaults —
			// that override is exactly what twMerge inside cn() exists to resolve.
			className={cn(
				"chatty-button inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-[13px] transition",
				"outline-none focus-visible:ring-3 focus-visible:ring-ink/15",
				// Tailwind v3's Preflight set `cursor: pointer` on every button; v4's
				// does not, so the upgrade silently gave the whole app an arrow
				// cursor on everything clickable. Stated here rather than in a base
				// layer because this component is the app's only <button>, and a
				// caller that wants a different affordance — the gallery's
				// `cursor-zoom-in` — still overrides it through cn().
				"cursor-pointer",
				"disabled:cursor-not-allowed disabled:opacity-[0.32]",
				variant === "primary" &&
					"border border-cobalt-hover bg-cobalt font-semibold text-on-cobalt hover:bg-cobalt-hover",
				variant === "outline" && "border border-ink font-semibold text-ink hover:bg-ink/5",
				variant === "ghost" && "font-medium text-ink-soft hover:bg-ink/5",
				variant === "danger" && "border border-signal font-semibold text-signal hover:bg-signal-soft",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
