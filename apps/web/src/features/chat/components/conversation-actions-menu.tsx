import type { ParticipantDTO } from "@chatty/shared-types";
import { Archive, Ban, BellOff, EyeOff, Pin } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface ConversationActionsMenuProps {
	isPinned: boolean;
	isArchived: boolean;
	isMuted: boolean;
	/** Present only for a direct conversation — restrict/block apply to a person. */
	peer: ParticipantDTO | null;
	isRestricted: boolean;
	isBlocked: boolean;
	isSaving: boolean;
	onTogglePin: () => void;
	onToggleArchive: () => void;
	onChooseMute: () => void;
	onToggleRestrict: () => void;
	onUnblock: () => void;
	onRequestBlock: () => void;
}

/** The default menu list; split out of `ConversationActions` once it grew items of its own. */
export function ConversationActionsMenu({
	isPinned,
	isArchived,
	isMuted,
	peer,
	isRestricted,
	isBlocked,
	isSaving,
	onTogglePin,
	onToggleArchive,
	onChooseMute,
	onToggleRestrict,
	onUnblock,
	onRequestBlock,
}: ConversationActionsMenuProps) {
	return (
		<>
			<Button
				variant="ghost"
				role="menuitem"
				disabled={isSaving}
				onClick={onTogglePin}
				className="w-full justify-start px-2.5 py-2 text-ink"
			>
				<Pin className={cn("size-4", isPinned && "fill-current text-signal")} />
				{isPinned ? "Unpin" : "Pin conversation"}
			</Button>
			<Button
				variant="ghost"
				role="menuitem"
				disabled={isSaving}
				onClick={onToggleArchive}
				className="w-full justify-start px-2.5 py-2 text-ink"
			>
				<Archive className="size-4 text-ink-faint" />
				{isArchived ? "Unarchive" : "Archive"}
			</Button>
			<Button
				variant="ghost"
				role="menuitem"
				disabled={isSaving}
				onClick={onChooseMute}
				className="w-full justify-start px-2.5 py-2 text-ink"
			>
				<BellOff className={cn("size-4", isMuted ? "text-signal" : "text-ink-faint")} />
				{isMuted ? "Muted" : "Mute"}
			</Button>
			{peer && (
				<Button
					variant="ghost"
					role="menuitem"
					disabled={isSaving}
					onClick={onToggleRestrict}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<EyeOff className="size-4 text-ink-faint" />
					{isRestricted ? "Unrestrict" : "Restrict"}
				</Button>
			)}
			{peer && (
				<Button
					variant="ghost"
					role="menuitem"
					disabled={isSaving}
					// Blocking asks; unblocking does not.
					onClick={isBlocked ? onUnblock : onRequestBlock}
					// Kept apart from reversible housekeeping actions.
					className="w-full justify-start border-t border-rule-soft px-2.5 py-2 text-signal"
				>
					<Ban className="size-4" />
					{isBlocked ? "Unblock" : "Block"}
				</Button>
			)}
		</>
	);
}
