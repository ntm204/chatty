import type { MessageEditDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";

interface MessageEditHistoryProps {
	conversationId: string;
	messageId: string;
	onClose: () => void;
}

/**
 * Every version of a message its author rewrote, newest first.
 *
 * Drawn as a timeline against a single hairline rather than as a stack of
 * cards: what matters is the order things were said in, and a card per version
 * makes four small edits look like four separate messages.
 */
export function MessageEditHistory({ conversationId, messageId, onClose }: MessageEditHistoryProps) {
	const [edits, setEdits] = useState<MessageEditDTO[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const titleId = useId();
	const dialogRef = useDialog<HTMLElement>(onClose);

	useEffect(() => {
		let isCurrent = true;
		setIsLoading(true);
		setError("");
		void api
			.listMessageEdits(conversationId, messageId)
			.then((found) => {
				if (isCurrent) setEdits(found);
			})
			.catch((loadError: Error) => {
				if (isCurrent) setError(loadError.message);
			})
			.finally(() => {
				if (isCurrent) setIsLoading(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [conversationId, messageId, attempt]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4 dark:bg-scrim/55"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="flex max-h-[min(70vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-panel border border-rule bg-paper shadow-modal outline-none"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-5">
					<div className="min-w-0">
						<h2 id={titleId} className="font-display text-[22px] leading-none tracking-tight">
							Edit history
						</h2>
						<p className="mt-2 text-[13px] text-ink-soft">What this message said before.</p>
					</div>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close edit history"
						className="size-8 shrink-0 border border-rule p-0"
					>
						<X className="size-3.5" />
					</Button>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					{isLoading && <p className="note py-8 text-center text-ink-faint">Loading edit history…</p>}
					{error && (
						<div className="flex flex-col items-start gap-2">
							<p role="alert" className="note text-signal">
								{error}
							</p>
							<Button variant="outline" onClick={() => setAttempt((value) => value + 1)} className="px-4">
								Try again
							</Button>
						</div>
					)}
					{!isLoading && !error && edits.length === 0 && (
						<p className="note py-8 text-center text-ink-faint">No previous versions.</p>
					)}
					{!isLoading && !error && edits.length > 0 && (
						<ul className="flex flex-col gap-4 border-l border-rule pl-4">
							{edits.map((edit) => (
								<li key={edit.id}>
									{/* The full date, not the thread's bare time: there is no
									    day rule above this list to give a time its context. */}
									<time dateTime={edit.editedAt} className="meta block text-ink-faint">
										{new Date(edit.editedAt).toLocaleString()}
									</time>
									<p className="mt-1 whitespace-pre-wrap wrap-break-word text-[13px] text-ink-soft">
										{edit.content || "No caption"}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>
			</section>
		</div>
	);
}
