import { CloudOff } from "lucide-react";

/**
 * Says that the live connection is gone.
 *
 * It exists because the failure is otherwise completely silent: nothing in this
 * app polls, so a dropped socket looks exactly like a quiet afternoon. Someone
 * reading a thread that has stopped updating deserves to know which of the two
 * they are looking at.
 *
 * Deliberately not `--signal`: this is a statement about the network, not
 * something the reader has done or can undo, and spending the app's one colour
 * on it would put it on the same footing as an unread count.
 */
export function ConnectionBanner() {
	return (
		<div
			role="status"
			className="flex shrink-0 items-center justify-center gap-2 border-b border-rule bg-paper-raised px-4 py-1.5"
		>
			<CloudOff aria-hidden="true" className="size-3.5 text-ink-faint" />
			<span className="note text-ink-soft">Reconnecting — new messages will appear when the link is back</span>
		</div>
	);
}
