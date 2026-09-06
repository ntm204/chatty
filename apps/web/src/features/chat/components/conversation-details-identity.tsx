import type { ConversationDTO } from "@chatty/shared-types";
import { getConversationTitle, getDirectPeer } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationDetailsIdentityProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
}

/** Read-only: renaming, photo, theme and nicknames all live in the Customize section below — see ADR 0022. */
export function ConversationDetailsIdentity({
	conversation,
	currentUserId,
	onlineUserIds,
}: ConversationDetailsIdentityProps) {
	const peer = getDirectPeer(conversation, currentUserId);

	return (
		<div className="flex shrink-0 flex-col items-center gap-2 border-b border-rule px-5 py-5 text-center">
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="lg"
			/>

			<div className="flex min-w-0 max-w-full flex-col items-center gap-1">
				<h3 className="max-w-full break-words text-lg font-semibold tracking-tight text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h3>

				{peer ? (
					<p className="meta max-w-full truncate text-ink-faint">@{peer.handle}</p>
				) : (
					<p className="text-xs text-ink-faint">{conversation.participants.length} members</p>
				)}
			</div>
		</div>
	);
}
