import type { ConversationDTO } from "@chatty/shared-types";
import { Bookmark } from "lucide-react";
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
		<div className="px-3 py-1">
			<Button
				variant="ghost"
				disabled={isOpening}
				onClick={() => void open()}
				className="min-h-12 w-full justify-start gap-3 px-3 py-2 text-left"
			>
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-sunken">
					<Bookmark className="size-4 text-heading" />
				</span>
				<span className="flex min-w-0 flex-col">
					<span className="text-[13px]">Saved messages</span>
					<span className="text-xs font-normal text-ink-faint">Notes, files, and things to keep</span>
				</span>
			</Button>
			{error && (
				<p role="alert" className="px-3 text-xs text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
