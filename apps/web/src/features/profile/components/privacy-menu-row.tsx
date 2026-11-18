import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/button";

interface PrivacyMenuRowProps {
	icon: LucideIcon;
	label: string;
	/** The current choice, shown faint on the right as Instagram and Messenger do. */
	value?: string | undefined;
	onOpen: () => void;
}

/** One row of the Privacy list: icon, what it is, its current value, and a chevron to its page. */
export function PrivacyMenuRow({ icon: Icon, label, value, onOpen }: PrivacyMenuRowProps) {
	return (
		<Button
			variant="ghost"
			onClick={onOpen}
			aria-label={value ? `${label}, ${value}` : label}
			className="h-auto w-full justify-start gap-3.5 rounded-control px-3 py-3 text-left font-normal"
		>
			<Icon aria-hidden="true" className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
			{/* The name stays whole; a long value gives way on a narrow screen. */}
			<span className="shrink-0 text-[15px] text-ink">{label}</span>
			<span className="min-w-0 flex-1 truncate text-right text-[14px] text-ink-faint">{value}</span>
			<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
		</Button>
	);
}
