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
			setError(caught instanceof Error ? caught.message : "Could not open saved messages");
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
				aria-label="Saved messages"
				title="Your personal notes and files"
				className="h-10 w-full justify-center gap-2 rounded-control bg-paper-sunken px-2 text-xs text-ink-soft hover:bg-ink/5"
			>
				<NotebookPen className="size-4" />
				Saved
			</Button>
			{error && (
				<p role="alert" className="px-3 text-xs text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
