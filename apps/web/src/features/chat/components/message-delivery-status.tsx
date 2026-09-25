import { Button } from "@/components/button";
import { useEffect, useState } from "react";
import type { MessageDeliveryState, ThreadMessage } from "../types/thread-message";

interface MessageDeliveryStatusProps {
	state: MessageDeliveryState;
	phase?: ThreadMessage["deliveryPhase"];
	progress?: number | undefined;
	onRetry: () => void;
	onDiscard: () => void;
}

/**
 * What the gutter says about a message that has not reached the server yet.
 *
 * It replaces the timestamp rather than joining it, because a message that is
 * still on its way has no send time to state — the one the draft carries is
 * this machine's guess, and printing it would claim something the server has
 * not agreed to.
 *
 * "Not sent" is the app's one colour, which is the rule rather than an
 * exception: `--signal` marks unread counts, the open conversation, and things
 * you cannot undo. A message the recipient never got is squarely the third.
 */
export function MessageDeliveryStatus({ state, phase, progress, onRetry, onDiscard }: MessageDeliveryStatusProps) {
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	useEffect(() => {
		const update = () => setIsOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);

		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	if (state === "pending") {
		const label = !isOnline
			? "Waiting for network…"
			: phase === "preparing"
				? "Preparing images…"
				: phase === "confirming"
					? "Awaiting confirmation…"
					: phase === "uploading"
						? `Uploading${progress === undefined ? "…" : ` ${progress}%`}`
						: "Sending…";

		return (
			<span role="status" className="meta text-ink-faint">
				{label}
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<span role="status" className="meta text-signal">
				{isOnline ? "Not sent" : "Waiting for network"}
			</span>
			<Button
				variant="ghost"
				onClick={onRetry}
				disabled={!isOnline}
				className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-soft hover:bg-transparent hover:text-ink"
			>
				Try again
			</Button>
			<Button
				variant="ghost"
				onClick={onDiscard}
				className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-faint hover:bg-transparent hover:text-ink"
			>
				Discard
			</Button>
		</span>
	);
}
