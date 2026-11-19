import type { ConversationDTO } from "@chatty/shared-types";
import type { GroupPermissions } from "../types/group-permissions";

/** What the person looking may do in this group, from its two permissions and their role. */
export function getGroupPermissions(conversation: ConversationDTO, currentUserId: string): GroupPermissions {
	const role = conversation.participants.find((participant) => participant.id === currentUserId)?.role;
	const isAdmin = role === "admin";
	const isMember = Boolean(role);

	return {
		isAdmin,
		canEditInfo: conversation.isGroup && isMember && (isAdmin || conversation.infoPolicy === "everyone"),
		canInvite: conversation.isGroup && isMember && (isAdmin || conversation.invitePolicy === "everyone"),
	};
}
