import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";

interface CustomSelectProps {
	label: string;
	value: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	disabled?: boolean;
	onChange: (value: string) => void;
}

export function CustomSelect({ label, value, options, disabled, onChange }: CustomSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const id = useId();
	useEffect(() => {
		if (!isOpen) return;
		rootRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
		function outside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
		}
		document.addEventListener("pointerdown", outside);

		return () => document.removeEventListener("pointerdown", outside);
	}, [isOpen]);

	return (
		<div
			ref={rootRef}
			className="relative"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape" && isOpen) {
					event.preventDefault();
					event.stopPropagation();
					setIsOpen(false);
					rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')?.focus();
				}
				if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
					event.preventDefault();
					if (!isOpen) {
						if (!disabled) setIsOpen(true);

						return;
					}
					const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
					const current = items.indexOf(document.activeElement as HTMLElement);
					const next =
						event.key === "Home"
							? 0
							: event.key === "End"
								? items.length - 1
								: (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
					items[next]?.focus();
				}
			}}
		>
			<p id={`${id}-label`} className="mb-2 text-xs font-medium text-ink-soft">
				{label}
			</p>
			<Button
				variant="outline"
				disabled={disabled}
				aria-labelledby={`${id}-label ${id}-value`}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-controls={isOpen ? id : undefined}
				onClick={() => setIsOpen(!isOpen)}
				className="w-full justify-between text-left font-normal"
			>
				<span id={`${id}-value`} className="truncate">
					{options.find((option) => option.value === value)?.label}
				</span>
				<ChevronDown className="size-4 shrink-0" />
			</Button>
			{isOpen && (
				<div
					id={id}
					role="listbox"
					aria-label={label}
					className="absolute inset-x-0 top-full z-30 mt-1 rounded-panel border border-rule bg-paper-raised p-1 shadow-lift"
				>
					{options.map((option) => (
						<Button
							key={option.value}
							variant="ghost"
							role="option"
							tabIndex={-1}
							aria-selected={value === option.value}
							onClick={() => {
								onChange(option.value);
								setIsOpen(false);
								rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')?.focus();
							}}
							className="w-full justify-between text-left font-normal"
						>
							{option.label}
							{value === option.value && <Check className="size-4" />}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
