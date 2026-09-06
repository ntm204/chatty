import type { ConversationDTO } from "@chatty/shared-types";
import { Trash2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { AVATAR_UPLOAD_HINT } from "@/constants/avatar-upload";
import { useDialog } from "@/hooks/use-dialog";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationPhotoDialogProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	onClose: () => void;
}

export function ConversationPhotoDialog({
	conversation,
	currentUserId,
	onlineUserIds,
	onClose,
}: ConversationPhotoDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setIsSaving(true);
		setError("");
		try {
			await api.uploadConversationAvatar(conversation.id, file);
			onClose();
		} catch (uploadError) {
			setError((uploadError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleRemove() {
		setIsSaving(true);
		setError("");
		try {
			await api.deleteConversationAvatar(conversation.id);
			onClose();
		} catch (removeError) {
			setError((removeError as Error).message);
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
				aria-label="Group photo"
				tabIndex={-1}
				className="flex w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Group photo</h2>
					<Button
						variant="ghost"
						aria-label="Close group photo"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex flex-col items-center gap-3 p-6">
					<ConversationAvatar
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
						size="lg"
					/>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={(event) => void handleFileSelected(event)}
						className="hidden"
					/>
					<p className="meta text-ink-faint">{AVATAR_UPLOAD_HINT}</p>
					{error && (
						<p role="alert" className="eyebrow text-signal">
							{error}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-1 border-t border-rule p-2">
					<Button
						variant="ghost"
						onClick={() => fileInputRef.current?.click()}
						disabled={isSaving}
						className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
					>
						<Upload className="size-4 text-ink-soft" />
						Upload photo
					</Button>
					{conversation.avatarUrl && (
						<Button
							variant="ghost"
							onClick={() => void handleRemove()}
							disabled={isSaving}
							className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal text-signal"
						>
							<Trash2 className="size-4" />
							Remove photo
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
