import type { ConversationDTO } from "@chatty/shared-types";
import { Camera } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { ConversationAvatar } from "../../components/conversation-avatar";
import { getConversationTitle, getDirectPeer } from "../../utils";
import { isSavedConversation } from "../../utils/is-saved-conversation";
import { ConversationPhotoDialog } from "./conversation-photo-dialog";

interface ConversationDetailsIdentityProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
}

/** Conversation header identity with camera quick-action for group admins. */
export function ConversationDetailsIdentity({
	conversation,
	currentUserId,
	onlineUserIds,
}: ConversationDetailsIdentityProps) {
	const peer = getDirectPeer(conversation, currentUserId);
	const isAdmin = conversation.participants.find((participant) => participant.id === currentUserId)?.role === "admin";
	const canUploadPhoto = conversation.isGroup && isAdmin;
	const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);

	return (
		<div className="flex shrink-0 flex-col items-center gap-2 border-b border-rule px-5 py-5 text-center">
			<div
				onClick={() => {
					if (canUploadPhoto) setIsPhotoDialogOpen(true);
				}}
				title={canUploadPhoto ? "Change group photo" : undefined}
				className={cn(
					"group relative rounded-full transition-all duration-200",
					canUploadPhoto && "cursor-pointer hover:ring-4 hover:ring-rule-soft",
				)}
			>
				<ConversationAvatar
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					size="lg"
				/>
				{canUploadPhoto && (
					<span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-paper-raised bg-ink text-paper-raised shadow-xs transition-transform group-hover:scale-110">
						<Camera className="size-3" />
					</span>
				)}
			</div>

			<div className="flex min-w-0 max-w-full flex-col items-center gap-1">
				<h3 className="max-w-full break-words text-lg font-semibold tracking-tight text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h3>

				{isSavedConversation(conversation, currentUserId) ? (
					<p className="text-xs text-ink-faint">Only you can see this</p>
				) : peer ? (
					<p className="meta max-w-full truncate text-ink-faint">@{peer.handle}</p>
				) : (
					<p className="text-xs text-ink-faint">{conversation.participants.length} members</p>
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
		</div>
	);
}
