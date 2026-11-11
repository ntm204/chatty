import { Button } from "@/components/button";

interface ImageRecoveryNoticeProps {
	error: string;
	isRetrying: boolean;
	onRetry: () => void;
}

export function ImageRecoveryNotice({ error, isRetrying, onRetry }: ImageRecoveryNoticeProps) {
	if (!error) return null;

	return (
		<div
			className="flex shrink-0 flex-col items-center gap-2 text-center text-sm text-on-media"
			onClick={(event) => event.stopPropagation()}
		>
			<p role="alert">{error}</p>
			<Button variant="ghost" disabled={isRetrying} onClick={onRetry} className="text-on-media">
				{isRetrying ? "Checking image access…" : "Retry image"}
			</Button>
		</div>
	);
}
