import { CornerUpLeft, Forward, Pencil, Pin, PinOff, SmilePlus, Trash2, UserRoundX, X } from "lucide-react";
import { Button } from "@/components/button";

interface MessageActionsMenuProps {
	isChoosingDeleteScope: boolean;
	setIsChoosingDeleteScope: (isChoosing: boolean) => void;
	onClose: () => void;
	onEdit?: (() => void) | undefined;
	onDeleteForEveryone?: (() => void) | undefined;
	onDeleteForMe: () => void;
	onReply?: (() => void) | undefined;
	/** Absent until somebody has reacted — see `MessageActions`. */
	onShowReactions?: (() => void) | undefined;
	onForward?: (() => void) | undefined;
	onTogglePin?: (() => void) | undefined;
	isPinned: boolean;
	canChangeForEveryone: boolean;
	remainingLabel: string | null;
}

export function MessageActionsMenu({
	isChoosingDeleteScope,
	setIsChoosingDeleteScope,
	onClose,
	onEdit,
	onDeleteForEveryone,
	onDeleteForMe,
	onReply,
	onShowReactions,
	onForward,
	onTogglePin,
	isPinned,
	canChangeForEveryone,
	remainingLabel,
}: MessageActionsMenuProps) {
	if (isChoosingDeleteScope) {
		return (
			<>
				<p className="eyebrow px-2.5 py-2 text-ink-faint">Delete this message</p>
				<Button
					variant="ghost"
					role="menuitem"
					onClick={onDeleteForMe}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<UserRoundX className="size-4" />
					Delete for me
				</Button>
				{canChangeForEveryone && onDeleteForEveryone && (
					<Button
						variant="ghost"
						role="menuitem"
						onClick={onDeleteForEveryone}
						className="w-full justify-start px-2.5 py-2 text-signal hover:bg-signal-soft"
					>
						<Trash2 className="size-4" />
						Delete for everyone
					</Button>
				)}
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => setIsChoosingDeleteScope(false)}
					className="w-full justify-start px-2.5 py-2 text-ink-faint"
				>
					<X className="size-4" />
					Cancel
				</Button>
			</>
		);
	}

	function runAndClose(action: () => void): void {
		onClose();
		action();
	}

	return (
		<>
			{onReply && (
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => runAndClose(onReply)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<CornerUpLeft className="size-4" />
					Reply
				</Button>
			)}
			{onShowReactions && (
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => runAndClose(onShowReactions)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<SmilePlus className="size-4" />
					Who reacted
				</Button>
			)}
			{onForward && (
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => runAndClose(onForward)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<Forward className="size-4" />
					Forward
				</Button>
			)}
			{onTogglePin && (
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => runAndClose(onTogglePin)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					{isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
					{isPinned ? "Unpin message" : "Pin message"}
				</Button>
			)}
			{canChangeForEveryone && onEdit && (
				<Button
					variant="ghost"
					role="menuitem"
					onClick={() => runAndClose(onEdit)}
					className="w-full justify-start px-2.5 py-2 text-ink"
				>
					<Pencil className="size-4" />
					Edit message
				</Button>
			)}
			<Button
				variant="ghost"
				role="menuitem"
				onClick={() => setIsChoosingDeleteScope(true)}
				className="w-full justify-start px-2.5 py-2 text-signal hover:bg-signal-soft"
			>
				<Trash2 className="size-4" />
				Delete message
			</Button>
			{remainingLabel && (
				<div className="mt-1 flex items-center justify-between gap-2 border-t border-rule-soft px-2.5 pb-1 pt-2">
					<span className="eyebrow text-ink-faint">Window</span>
					<span className="meta text-ink-faint">{remainingLabel}</span>
				</div>
			)}
		</>
	);
}
