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
				className="w-full justify-between px-3 py-2 text-sm font-medium text-ink-soft"
			>
				{label}
				<ChevronDown className={cn("size-4 text-ink-faint transition-transform", isOpen && "rotate-180")} />
			</Button>
			{isOpen && children}
		</div>
	);
}
