import type { ConversationDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useDialog } from "@/hooks/use-dialog";

interface ConversationRenameDialogProps {
	conversation: ConversationDTO;
	onClose: () => void;
}

export function ConversationRenameDialog({ conversation, onClose }: ConversationRenameDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);
	const [nameDraft, setNameDraft] = useState(conversation.name ?? "");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const trimmed = nameDraft.trim();

	async function save() {
		if (!trimmed || trimmed === conversation.name) return;
		setIsSaving(true);
		setError("");
		try {
			await api.renameConversation(conversation.id, trimmed);
			onClose();
		} catch (renameError) {
			setError((renameError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Rename group"
				tabIndex={-1}
				className="flex w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Rename group</h2>
					<Button
						variant="ghost"
						aria-label="Close rename group"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
					className="flex flex-col gap-4 p-4"
				>
					<TextField
						label="Group name"
						value={nameDraft}
						onChange={(event) => setNameDraft(event.target.value)}
						disabled={isSaving}
						error={error}
						autoFocus
						maxLength={100}
					/>
					<Button type="submit" disabled={isSaving || !trimmed || trimmed === conversation.name}>
						Save
					</Button>
				</form>
			</div>
		</div>
	);
}
