import type { ConversationDTO } from "@chatty/shared-types";
import { ChevronRight, Palette } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { CONVERSATION_THEME_OPTIONS } from "../constants/conversation-theme";
import { ConversationThemeDialog } from "./conversation-theme-dialog";

interface ConversationThemeControlProps {
	conversation: ConversationDTO;
}

export function ConversationThemeControl({ conversation }: ConversationThemeControlProps) {
	const [isOpen, setIsOpen] = useState(false);
	const close = useCallback(() => setIsOpen(false), []);
	const currentLabel =
		CONVERSATION_THEME_OPTIONS.find((option) => option.value === conversation.themeColor)?.label ?? "Default";

	return (
		<>
			<Button
				variant="ghost"
				onClick={() => setIsOpen(true)}
				aria-label={`Theme: ${currentLabel}`}
				aria-haspopup="dialog"
				aria-expanded={isOpen}
				className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
					<Palette className="size-4 text-ink-soft" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">Theme</span>
				<span className="text-xs text-ink-faint">{currentLabel}</span>
				<ChevronRight className="size-4 text-ink-faint" />
			</Button>
			{isOpen && <ConversationThemeDialog key={conversation.id} conversation={conversation} onClose={close} />}
		</>
	);
}
