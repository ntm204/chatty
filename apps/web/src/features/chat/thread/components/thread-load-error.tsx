import { Button } from "@/components/button";

interface ThreadLoadErrorProps {
	message: string;
	onRetry: () => void;
}

/**
 * What a conversation shows when its messages could not be fetched.
 *
 * Before this the same failure rendered an empty thread — indistinguishable
 * from a conversation nobody has written in, and with nothing to try again
 * with. The server's own message is shown rather than a generic line, because
 * "Network request failed" and "You are no longer in this conversation" ask the
 * reader to do different things.
 */
export function ThreadLoadError({ message, onRetry }: ThreadLoadErrorProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
			<div className="flex flex-col gap-1.5">
				<p className="text-sm text-ink">This conversation could not be loaded.</p>
				<p className="text-[13px] text-ink-faint">{message}</p>
			</div>
			<Button variant="outline" onClick={onRetry}>
				Try again
			</Button>
		</div>
	);
}
