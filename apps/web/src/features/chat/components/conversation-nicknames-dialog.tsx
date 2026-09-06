import type { ConversationDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { ConversationNicknameRow } from "./conversation-nickname-row";

interface ConversationNicknamesDialogProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onClose: () => void;
}

/**
 * Shared, not private: any participant may set or clear anyone's name here,
 * including their own, and everyone in the conversation sees it. A modal
 * rather than embedded in "Customize chat" so a group's member count never
 * changes the details panel's own size — see conventions/frontend.md.
 * See ADR 0022.
 */
export function ConversationNicknamesDialog({
	conversation,
	currentUserId,
	onClose,
}: ConversationNicknamesDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);

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
				aria-label="Nicknames"
				tabIndex={-1}
				className="flex h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Nicknames</h2>
					<Button
						variant="ghost"
						aria-label="Close nicknames"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				<ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
					{conversation.participants.map((participant) => (
						<ConversationNicknameRow
							key={participant.id}
							conversationId={conversation.id}
							participant={participant}
							isSelf={participant.id === currentUserId}
						/>
					))}
				</ul>
			</div>
		</div>
	);
}
