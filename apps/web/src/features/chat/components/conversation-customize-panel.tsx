import type { ConversationDTO } from "@chatty/shared-types";
import { Camera, ChevronRight, Pencil, Type } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { ConversationNicknamesDialog } from "./conversation-nicknames-dialog";
import { ConversationPhotoDialog } from "./conversation-photo-dialog";
import { ConversationRenameDialog } from "./conversation-rename-dialog";
import { ConversationThemeControl } from "./conversation-theme-control";

interface ConversationCustomizePanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	isAdmin: boolean;
}

/**
 * Everything Messenger groups under "Customize chat": rename, photo, theme,
 * and nicknames — each its own row, not folded into the name-display header
 * the way rename and nickname used to be. Rename, photo and nicknames each
 * open their own modal rather than an inline field-plus-Save, for the same
 * reason the pinned-messages list does — see conventions/frontend.md. Rename
 * and photo are group-identity changes and stay admin-gated; theme and
 * nicknames are cosmetic, so any participant may change them. See ADR 0022.
 */
export function ConversationCustomizePanel({
	conversation,
	currentUserId,
	onlineUserIds,
	isAdmin,
}: ConversationCustomizePanelProps) {
	const [isRenameOpen, setIsRenameOpen] = useState(false);
	const [isPhotoOpen, setIsPhotoOpen] = useState(false);
	const [isNicknamesOpen, setIsNicknamesOpen] = useState(false);

	return (
		<div className="flex flex-col">
			{/* A direct conversation has no name of its own to rename — see
			    `getConversationTitle`, which titles it from the peer's nickname
			    instead, right below. */}
			{conversation.isGroup && (
				<Button
					variant="ghost"
					onClick={() => setIsRenameOpen(true)}
					disabled={!isAdmin}
					className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
				>
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
						<Pencil className="size-4 text-ink-soft" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{conversation.name}</span>
					<span className="meta text-ink-faint">Rename</span>
					<ChevronRight className="size-4 text-ink-faint" />
				</Button>
			)}

			{conversation.isGroup && (
				<Button
					variant="ghost"
					onClick={() => setIsPhotoOpen(true)}
					disabled={!isAdmin}
					className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
				>
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
						<Camera className="size-4 text-ink-soft" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">Group photo</span>
					<ChevronRight className="size-4 text-ink-faint" />
				</Button>
			)}

			{conversation.isGroup && !isAdmin && (
				<p className="px-3 py-2 text-sm text-ink-soft">
					Only group admins can rename this group or change its photo.
				</p>
			)}

			<ConversationThemeControl conversation={conversation} />

			<Button
				variant="ghost"
				onClick={() => setIsNicknamesOpen(true)}
				className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
					<Type className="size-4 text-ink-soft" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">Nicknames</span>
				<ChevronRight className="size-4 text-ink-faint" />
			</Button>

			{isRenameOpen && (
				<ConversationRenameDialog conversation={conversation} onClose={() => setIsRenameOpen(false)} />
			)}

			{isPhotoOpen && (
				<ConversationPhotoDialog
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					onClose={() => setIsPhotoOpen(false)}
				/>
			)}

			{isNicknamesOpen && (
				<ConversationNicknamesDialog
					conversation={conversation}
					currentUserId={currentUserId}
					onClose={() => setIsNicknamesOpen(false)}
				/>
			)}
		</div>
	);
}
