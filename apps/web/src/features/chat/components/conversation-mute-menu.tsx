import { ArrowLeft, Check, Clock } from "lucide-react";
import { Button } from "@/components/button";
import { CONVERSATION_MUTE_OPTIONS } from "../constants/conversation-actions";

interface ConversationMuteMenuProps {
	isMuted: boolean;
	isSaving: boolean;
	onBack: () => void;
	onUnmute: () => void;
	onMuteFor: (milliseconds: number | null) => void;
}

/** Shares the parent menu's focus and mutation lifecycle while showing its duration choices. */
export function ConversationMuteMenu({ isMuted, isSaving, onBack, onUnmute, onMuteFor }: ConversationMuteMenuProps) {
	return (
		<>
			<Button
				variant="ghost"
				role="menuitem"
				onClick={onBack}
				className="w-full justify-start px-2.5 py-2 text-ink-faint"
			>
				<ArrowLeft className="size-4" />
				Mute duration
			</Button>
			{isMuted && (
				<Button
					variant="ghost"
					role="menuitem"
					disabled={isSaving}
					onClick={onUnmute}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<Check className="size-4 text-live" />
					Unmute
				</Button>
			)}
			{CONVERSATION_MUTE_OPTIONS.map((option) => (
				<Button
					key={option.label}
					variant="ghost"
					role="menuitem"
					disabled={isSaving}
					onClick={() => onMuteFor(option.milliseconds)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<Clock className="size-4 text-ink-faint" />
					{option.label}
				</Button>
			))}
		</>
	);
}
