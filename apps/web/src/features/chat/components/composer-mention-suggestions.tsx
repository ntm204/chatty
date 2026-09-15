import type { ParticipantDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { Button } from "@/components/button";

interface ComposerMentionSuggestionsProps {
	participants: ParticipantDTO[];
	listId: string;
	selectedIndex: number;
	onPick: (participant: ParticipantDTO) => void;
}

export function ComposerMentionSuggestions({
	participants,
	onPick,
	listId,
	selectedIndex,
}: ComposerMentionSuggestionsProps) {
	if (participants.length === 0) return null;

	return (
		<div
			id={listId}
			role="listbox"
			aria-label="Mention suggestions"
			className="mx-3 mb-2 overflow-hidden rounded-control border border-rule bg-paper-raised shadow-lift"
		>
			{participants.map((participant, index) => (
				<Button
					key={participant.id}
					role="option"
					id={`${listId}-${index}`}
					aria-selected={index === selectedIndex}
					tabIndex={-1}
					onMouseDown={(event) => event.preventDefault()}
					variant="ghost"
					onClick={() => onPick(participant)}
					className={cn(
						"w-full justify-start rounded-none px-3 py-2 text-left",
						index === selectedIndex && "bg-signal-soft",
					)}
				>
					<span className="font-semibold">{participant.displayName}</span>
					<span className="text-ink-faint">@{participant.handle}</span>
				</Button>
			))}
		</div>
	);
}
