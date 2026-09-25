import { useCallback, useEffect } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";

interface ConfirmDialogProps {
	title: string;
	/** What will happen, in a sentence. Say the consequence, not the mechanism. */
	body: string;
	/** Names the action rather than agreeing — "Remove", not "OK". */
	confirmLabel: string;
	/** Keeps an irreversible action from being submitted twice while it is in flight. */
	isConfirming?: boolean;
	/** A request error belongs beside the action that caused it, not behind the dialog. */
	error?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Asks before something that cannot be taken back.
 *
 * The app went without one for a long time on the stated grounds that nothing
 * else had one, which was true and was the wrong test: the reason to confirm is
 * that the action is irreversible, and removing somebody from a group, leaving
 * one, and deleting a message for everybody all are. What kept it out was the
 * absence of a dialog primitive; `use-dialog` is that primitive, and it already
 * carries Escape, the focus trap and focus-on-open.
 *
 * The confirm button is `danger`, which is outlined rather than filled for the
 * reason recorded in `Button`: a solid red block invites the click this dialog
 * exists to slow down. Cancel is the first control in the DOM, so the focus
 * trap's opening move is the harmless one.
 */
export function ConfirmDialog({
	title,
	body,
	confirmLabel,
	isConfirming = false,
	error,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	// Escape must respect the same pending boundary as the disabled Cancel button.
	const handleCancel = useCallback(() => {
		if (!isConfirming) onCancel();
	}, [onCancel, isConfirming]);
	const dialogRef = useDialog<HTMLDivElement>(handleCancel);
	useEffect(() => {
		dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
	}, [dialogRef]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/20 px-4 dark:bg-scrim/50">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				tabIndex={-1}
				className="flex w-full max-w-[380px] flex-col gap-4 rounded-bubble border border-rule bg-paper-raised p-5 outline-none"
			>
				<div className="flex flex-col gap-1.5">
					<h2 className="font-display text-[19px] leading-tight tracking-tight">{title}</h2>
					<p className="text-[13px] text-ink-soft">{body}</p>
					{error && (
						<p role="alert" className="text-[13px] text-signal">
							{error}
						</p>
					)}
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="ghost" disabled={isConfirming} onClick={handleCancel}>
						Cancel
					</Button>
					<Button variant="danger" disabled={isConfirming} onClick={onConfirm}>
						{isConfirming ? `${confirmLabel}…` : confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
