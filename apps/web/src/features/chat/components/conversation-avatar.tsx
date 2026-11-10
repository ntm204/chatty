import type { ConversationDTO } from "@chatty/shared-types";
import { Avatar } from "@/components/avatar";
import { Bookmark } from "lucide-react";
import { isSavedConversation } from "../utils/is-saved-conversation";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";
import { getDirectPeer } from "../utils";
import { GroupAvatar } from "./group-avatar";

interface ConversationAvatarProps {
	conversation: ConversationDTO;
	currentUserId: string;
	/** Who is online now; a direct conversation's avatar shows the peer's dot. */
	onlineUserIds: Set<string>;
	size?: AvatarSize;
}

/**
 * The picture for a conversation row.
 *
 * A 1-1 is the other person's avatar. A group is its own picture, or, until
 * someone sets one, three grey figures (`GroupAvatar`), matching a person's silhouette.
 *
 * Sized from the same map the avatar uses rather than a second copy of the
 * numbers: a sidebar mixing groups and direct chats has to keep one column of
 * text, and two maps drift the first time one of them is edited.
 */
export function ConversationAvatar({
	conversation,
	currentUserId,
	onlineUserIds,
	size = "md",
}: ConversationAvatarProps) {
	if (isSavedConversation(conversation, currentUserId)) {
		return (
			<span
				aria-hidden="true"
				className={cn(
					"flex shrink-0 items-center justify-center bg-paper-sunken text-heading",
					AVATAR_SIZE_CLASSES[size],
				)}
			>
				<Bookmark className="h-1/2 w-1/2" />
			</span>
		);
	}
	const peer = getDirectPeer(conversation, currentUserId);

	if (!peer) {
		if (conversation.avatarUrl) {
			return (
				<img
					src={conversation.avatarUrl}
					alt=""
					className={cn("rounded-full object-cover", AVATAR_SIZE_CLASSES[size])}
				/>
			);
		}

		return <GroupAvatar size={size} />;
	}

	return <Avatar user={peer} size={size} isOnline={onlineUserIds.has(peer.id)} />;
}
