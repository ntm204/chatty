import type { ConversationDTO } from "@chatty/shared-types";
import { Avatar } from "@/components/avatar";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";
import { getInitials } from "@/utils/get-initials";
import { getConversationTitle, getDirectPeer } from "../utils";

interface ConversationAvatarProps {
	conversation: ConversationDTO;
	currentUserId: string;
	/** Unused — kept so callers that still track presence don't need a special case. */
	onlineUserIds: Set<string>;
	size?: AvatarSize;
}

/**
 * The picture for a conversation row.
 *
 * A 1-1 is the other person's avatar. A group is an
 * ink-filled circle carrying the group's own initials — not one member's face,
 * because picking a member would be arbitrary and their presence would read as
 * the group's, and not a generic icon either, which made every group in a
 * sidebar look like the same conversation.
 *
 * Sized from the same map the avatar uses rather than a second copy of the
 * numbers: a sidebar mixing groups and direct chats has to keep one column of
 * text, and two maps drift the first time one of them is edited.
 */
export function ConversationAvatar({ conversation, currentUserId, size = "md" }: ConversationAvatarProps) {
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

		return (
			<span
				aria-hidden="true"
				className={cn(
					"flex shrink-0 items-center justify-center bg-block font-mono font-semibold tracking-tight text-block-ink",
					AVATAR_SIZE_CLASSES[size],
				)}
			>
				{getInitials(getConversationTitle(conversation, currentUserId))}
			</span>
		);
	}

	return <Avatar user={peer} size={size} />;
}
