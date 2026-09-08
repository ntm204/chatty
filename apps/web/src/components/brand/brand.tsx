import { useBrandGaze } from "@/hooks/use-brand-gaze";
import { cn } from "@/utils/cn";

interface BrandProps {
	className?: string;
}

export function Brand({ className }: BrandProps) {
	const brandRef = useBrandGaze();

	return (
		<span ref={brandRef} className={cn("brand", className)}>
			<span className="brand-symbol" aria-hidden="true">
				<i />
				<i />
			</span>
			<span>chatty</span>
		</span>
	);
}
