import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import { isComposingKey } from "@/utils/is-composing-key";
import { useRef, useState } from "react";
import { Button } from "@/components/button";

interface MessageEditorProps {
	initialContent: string;
	/** Whether the message has an image, which is what lets the text be cleared. */
	hasAttachment: boolean;
	onSave: (content: string) => void | Promise<void>;
	onCancel: () => void;
}

/**
 * The bubble, turned into a field, while its author rewrites it.
 *
 * Editing happens in place rather than in the composer at the bottom. The
 * composer is where a *new* message is written, and borrowing it would mean the
 * message being changed scrolls out of sight behind the thing changing it.
 *
 * The save rule mirrors the server's, so the button is disabled rather than the
 * request refused: a message has to be something, and clearing the text is only
 * allowed when a picture is left to stand on its own.
 */
export function MessageEditor({ initialContent, hasAttachment, onSave, onCancel }: MessageEditorProps) {
	const [draft, setDraft] = useState(initialContent);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const isSavingRef = useRef(false);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	useAutosizeTextarea(fieldRef, draft);

	const trimmed = draft.trim();
	const canSave = (Boolean(trimmed) || hasAttachment) && trimmed !== initialContent;

	async function save(): Promise<void> {
		if (!canSave || isSavingRef.current) return;
		isSavingRef.current = true;
		setIsSaving(true);
		setError("");
		try {
			await onSave(trimmed);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The edit could not be saved. Try again.");
		} finally {
			isSavingRef.current = false;
			setIsSaving(false);
		}
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (isComposingKey(event)) return;
		// Enter saves and Shift+Enter breaks the line, matching what people expect
		// from the composer. Escape abandons the edit, which is the only way out
		// that does not involve finding a small button with the mouse.
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (!event.repeat) void save();
		}

		if (event.key === "Escape" && !isSavingRef.current) onCancel();
	}

	return (
		<div className="flex min-w-64 max-w-[70vw] flex-col gap-2">
			<textarea
				ref={fieldRef}
				disabled={isSaving}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
				aria-label="Edit message"
				autoFocus
				rows={2}
				className="max-h-40 min-h-16 w-full resize-none overflow-y-auto rounded-control border border-rule bg-paper-raised px-3 py-2 text-sm text-ink outline-none transition focus:border-ink focus:ring-3 focus:ring-ink/[0.07]"
			/>

			{error && (
				<p role="alert" className="text-xs text-signal">
					{error}
				</p>
			)}
			<div className="flex items-center justify-between gap-3">
				<span className="eyebrow text-ink-faint">Enter to save · Esc to cancel</span>
				<div className="flex items-center gap-1">
					<Button variant="ghost" onClick={onCancel} disabled={isSaving} className="px-2.5 py-1.5 text-xs">
						Cancel
					</Button>
					<Button onClick={() => void save()} disabled={!canSave || isSaving} className="px-3 py-1.5 text-xs">
						{isSaving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
