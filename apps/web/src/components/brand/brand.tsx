import { Asterisk } from "lucide-react";
import { cn } from "@/utils/cn";

interface BrandProps {
	className?: string;
}

export function Brand({ className }: BrandProps) {
	return (
		<span className={cn("brand", className)}>
			<span className="brand-flower" aria-hidden="true">
				<Asterisk />
			</span>
			<span>
				chatty<span className="brand-period">.</span>
			</span>
		</span>
	);
}
