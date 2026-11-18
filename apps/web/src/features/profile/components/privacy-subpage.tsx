import { ArrowLeft } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/button";

interface PrivacySubpageProps {
	title: string;
	description?: string;
	onBack: () => void;
	/** Receives the heading's id, for a radio group or list to name itself by. */
	children: (headingId: string) => ReactNode;
}

/** A page inside Privacy: back to the list, the setting's name, one sentence on what it does, then its control. */
export function PrivacySubpage({ title, description, onBack, children }: PrivacySubpageProps) {
	const headingId = useId();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Button variant="ghost" onClick={onBack} aria-label="Back to privacy" className="-ml-2 size-9 p-0">
					<ArrowLeft className="size-5" />
				</Button>
				<h3 id={headingId} className="text-[17px] font-semibold text-ink">
					{title}
				</h3>
			</div>
			{description && <p className="-mt-1 text-[13px] leading-normal text-ink-soft">{description}</p>}
			{children(headingId)}
		</div>
	);
}
