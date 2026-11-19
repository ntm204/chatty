import type { ConversationDTO } from "@chatty/shared-types";
import { ImagePlus, UserPlus } from "lucide-react";
import { api } from "@/api/client";
import { GroupPermissionSwitch } from "./group-permission-switch";

interface GroupPermissionsControlProps {
	conversation: ConversationDTO;
	isAdmin: boolean;
}

/**
 * Facebook's group permissions: who may add people, and who may change the
 * group's name and photo. Each is a switch that, on, leaves it to admins; every
 * change is announced in the chat by name.
 */
export function GroupPermissionsControl({ conversation, isAdmin }: GroupPermissionsControlProps) {
	return (
		<div className="flex flex-col">
			<GroupPermissionSwitch
				icon={UserPlus}
				label="Only admins can add people"
				policy={conversation.invitePolicy}
				isAdmin={isAdmin}
				save={(policy) => api.setGroupInvitePolicy(conversation.id, policy)}
			/>
			<GroupPermissionSwitch
				icon={ImagePlus}
				label="Only admins can change name and photo"
				policy={conversation.infoPolicy}
				isAdmin={isAdmin}
				save={(policy) => api.setGroupInfoPolicy(conversation.id, policy)}
			/>
			{!isAdmin && <p className="note pt-1 text-ink-faint">Only group admins can change these.</p>}
		</div>
	);
}
