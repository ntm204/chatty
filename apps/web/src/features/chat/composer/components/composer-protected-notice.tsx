import { Lock, X } from "lucide-react";
import { Button } from "@/components/button";

interface ComposerProtectedNoticeProps {
	onTurnOff: () => void;
}

/**
 * Says what "protected" will do before the message is sent, in the words the
 * recipient will experience it — and where it stops, so the lock never
 * promises more than it keeps.
 */
export function ComposerProtectedNotice({ onTurnOff }: ComposerProtectedNoticeProps) {
	return (
		<div role="status" className="flex items-start gap-2.5 rounded-panel bg-paper-sunken px-3 py-2">
			<Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
			<p className="note min-w-0 flex-1 text-ink-soft">
				Opens once, gone within 24h, can't be copied or forwarded. Chatty can't block screenshots.
			</p>
			<Button
				variant="ghost"
				onClick={onTurnOff}
				aria-label="Send as a normal message"
				className="size-6 shrink-0 p-0 text-ink-faint hover:bg-transparent hover:text-ink"
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}
