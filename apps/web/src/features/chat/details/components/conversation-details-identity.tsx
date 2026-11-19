import type { ConversationDTO } from "@chatty/shared-types";
import { Camera, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { ConversationAvatar } from "../../components/conversation-avatar";
import { getConversationTitle, getDirectPeer } from "../../utils";
import { isSavedConversation } from "../../utils/is-saved-conversation";
import { getGroupPermissions } from "../utils/group-permissions";
import { ConversationPhotoDialog } from "./conversation-photo-dialog";
import { ConversationRenameDialog } from "./conversation-rename-dialog";

interface ConversationDetailsIdentityProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
}

/**
 * The face and name at the top of the details panel, as on Messenger. Whoever
 * the group lets change its info gets a camera on the photo and a pencil by the
 * name — the edit sits on the thing it edits.
 */
export function ConversationDetailsIdentity({
	conversation,
	currentUserId,
	onlineUserIds,
}: ConversationDetailsIdentityProps) {
	const peer = getDirectPeer(conversation, currentUserId);
	const { canEditInfo } = getGroupPermissions(conversation, currentUserId);
	const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
	const [isRenameOpen, setIsRenameOpen] = useState(false);
	const title = getConversationTitle(conversation, currentUserId);
	const isOnline = peer ? onlineUserIds.has(peer.id) : false;

	return (
		<div className="flex shrink-0 flex-col items-center gap-2.5 px-5 pt-7 pb-4 text-center">
			<div className="relative">
				<ConversationAvatar
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					size="lg"
				/>
				{canEditInfo && (
					<Button
						variant="ghost"
						onClick={() => setIsPhotoDialogOpen(true)}
						aria-label="Edit group photo"
						className="absolute -right-1 -bottom-1 size-7 rounded-full border-2 border-paper-raised bg-paper-sunken p-0 text-ink hover:bg-paper"
					>
						<Camera className="size-3.5" />
					</Button>
				)}
			</div>

			<div className="flex max-w-full min-w-0 flex-col items-center gap-0.5">
				<div className="flex max-w-full items-center gap-1">
					<h3 className="max-w-full text-[17px] font-semibold tracking-tight break-words text-ink">
						{title}
					</h3>
					{canEditInfo && (
						<Button
							variant="ghost"
							onClick={() => setIsRenameOpen(true)}
							aria-label="Edit group name"
							className="size-7 shrink-0 rounded-full p-0 text-ink-faint hover:text-ink"
						>
							<Pencil className="size-3.5" />
						</Button>
					)}
				</div>

				{isSavedConversation(conversation, currentUserId) ? (
					<p className="text-[13px] text-ink-faint">Only you can see this</p>
				) : peer ? (
					<p className="text-[13px] text-ink-faint">{isOnline ? "Active now" : `@${peer.handle}`}</p>
				) : (
					<p className="text-[13px] text-ink-faint">{conversation.participants.length} members</p>
				)}
			</div>

			{isPhotoDialogOpen && (
				<ConversationPhotoDialog
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					onClose={() => setIsPhotoDialogOpen(false)}
				/>
			)}
			{isRenameOpen && (
				<ConversationRenameDialog conversation={conversation} onClose={() => setIsRenameOpen(false)} />
			)}
		</div>
	);
}
