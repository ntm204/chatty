import { useBrandGaze } from "@/hooks/use-brand-gaze";
import { BRAND_LETTERS } from "@/constants/brand";
import { cn } from "@/utils/cn";

interface BrandProps {
	className?: string;
	hasSeparateLetters?: boolean;
	isSymbolOnly?: boolean;
}

export function Brand({ className, hasSeparateLetters = false, isSymbolOnly = false }: BrandProps) {
	const brandRef = useBrandGaze();

	return (
		<span ref={brandRef} className={cn("brand", className)}>
			<span className="brand-symbol" aria-hidden="true">
				<i />
				<i />
			</span>
			{isSymbolOnly ? (
				<span className="sr-only">chatty</span>
			) : hasSeparateLetters ? (
				<>
					<span className="brand-wordmark" aria-hidden="true">
						{BRAND_LETTERS.map((letter, index) => (
							<span key={index}>{letter}</span>
						))}
					</span>
					<span className="sr-only">chatty</span>
				</>
			) : (
				<span>chatty</span>
			)}
		</span>
	);
}
