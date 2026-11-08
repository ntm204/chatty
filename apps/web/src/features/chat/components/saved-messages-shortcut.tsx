import type { ConversationDTO } from "@chatty/shared-types";
import { NotebookPen } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";

interface SavedMessagesShortcutProps {
	userId: string;
	onOpen: (id: string, conversation: ConversationDTO) => void;
}

export function SavedMessagesShortcut({ userId, onOpen }: SavedMessagesShortcutProps) {
	const [isOpening, setIsOpening] = useState(false);
	const [error, setError] = useState("");

	async function open() {
		if (isOpening) return;
		setIsOpening(true);
		setError("");
		try {
			const conversation = await api.createConversation([userId]);
			onOpen(conversation.id, conversation);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not open your notes");
		} finally {
			setIsOpening(false);
		}
	}

	return (
		<div className="min-w-0">
			<Button
				variant="ghost"
				disabled={isOpening}
				onClick={() => void open()}
				aria-label="Notes"
				title="Messages and files only you can see"
				role="menuitem"
				className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13.5px] font-normal text-ink hover:bg-paper-sunken"
			>
				<NotebookPen className="size-4 text-ink-faint" />
				Notes
			</Button>
			{error && (
				<p role="alert" className="px-3 text-xs text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
