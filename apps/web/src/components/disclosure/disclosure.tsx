import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface DisclosureProps {
	label: string;
	defaultOpen?: boolean;
	/**
	 * Controlled open state, for a caller whose own content unmounts the
	 * `Disclosure` itself — internal state would otherwise reset to
	 * `defaultOpen` every time, which reads as the section closing on its own.
	 * Omit both this and `onOpenChange` to keep the section's own memory.
	 */
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
	children: ReactNode;
}

/** A custom-styled expand/collapse section — replaces the browser's own `<details>` triangle. */
export function Disclosure({
	label,
	defaultOpen = false,
	isOpen: controlledIsOpen,
	onOpenChange,
	className,
	children,
}: DisclosureProps) {
	const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(defaultOpen);
	const isOpen = controlledIsOpen ?? uncontrolledIsOpen;

	function toggle() {
		if (onOpenChange) onOpenChange(!isOpen);
		else setUncontrolledIsOpen(!isOpen);
	}

	return (
		<div className={className}>
			<Button
				variant="ghost"
				onClick={toggle}
				aria-expanded={isOpen}
				className="w-full justify-between px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink"
			>
				{label}
				<ChevronDown
					className={cn(
						"size-4 text-ink-faint transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
						isOpen && "rotate-180",
					)}
				/>
			</Button>
			<div
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
					isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none",
				)}
			>
				<div className="min-h-0 overflow-hidden" aria-hidden={!isOpen}>
					{children}
				</div>
			</div>
		</div>
	);
}
