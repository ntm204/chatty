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
				className="min-h-12 w-full justify-start gap-3 px-3 text-left font-normal"
			>
				<Palette className="size-4 text-heading" />
				<span className="flex-1 text-[13px]">Theme</span>
				<span className="text-xs text-ink-faint">{currentLabel}</span>
				<ChevronRight className="size-4 text-ink-faint" />
			</Button>
			{isOpen && <ConversationThemeDialog key={conversation.id} conversation={conversation} onClose={close} />}
		</>
	);
}
