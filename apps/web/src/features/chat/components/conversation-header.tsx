import type { ConversationDTO } from "@chatty/shared-types";
import { ArrowLeft, PanelRight, Search } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { getConversationPresence, getConversationTitle, getTypingMessage } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationHeaderProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	typingUserIds: string[];
	/** Toggles the group members panel. Omitted for a direct conversation, which has no group settings to show. */
	onToggleGroupMembers?: () => void;
	isManagingGroup?: boolean;
	onOpenMessageSearch?: () => void;
	onBack?: () => void;
}

/**
 * Who you are talking to, and the one line that says where they are.
 *
 * Presence is already shown on the avatar, so a direct conversation's status
 * line stays compact and uses text alone.
 */
export function ConversationHeader({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	onToggleGroupMembers,
	isManagingGroup,
	onOpenMessageSearch,
	onBack,
}: ConversationHeaderProps) {
	// Typing wins over presence: someone typing is obviously online, and showing
	// both would flicker the line between two facts that say the same thing.
	const typingMessage = getTypingMessage(
		typingUserIds.filter((userId) => userId !== currentUserId),
		conversation.participants,
	);
	const { isPeerOnline, peerStatus, onlineCount } = getConversationPresence(
		conversation,
		currentUserId,
		onlineUserIds,
	);

	return (
		<header className="flex h-[70px] shrink-0 items-center gap-3 border-b border-rule bg-paper-raised px-4 sm:px-5 md:px-7">
			{onBack && (
				<Button
					variant="ghost"
					onClick={onBack}
					aria-label="Back to conversations"
					className="-ml-2 size-8 shrink-0 p-0 lg:hidden"
				>
					<ArrowLeft className="size-4" />
				</Button>
			)}
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="md"
			/>

			{/*
				The 44px face deliberately frames rather than matches the 32px identity
				block. At 32px the picture read like a utility icon beside two lines of
				type; the larger silhouette makes the person or group the primary cue
				without increasing the fixed header height.
			*/}
			<div className="flex min-w-0 flex-1 flex-col justify-center">
				<h1 className="truncate text-[14px] font-semibold leading-[18px] tracking-tight text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h1>

				<div className="flex h-[14px] items-center gap-2">
					{typingMessage ? (
						<>
							<span className="truncate text-[11px] text-ink-soft">
								{typingMessage?.replace(/…$/, "")}
							</span>
						</>
					) : conversation.isGroup ? (
						<>
							<span className="eyebrow text-ink-faint">{conversation.participants.length} members</span>
							{onlineCount > 0 && (
								<>
									<span aria-hidden="true" className="h-2.5 w-px bg-rule" />
									<span className="eyebrow text-live">{onlineCount} online</span>
								</>
							)}
						</>
					) : (
						<span className={cn("eyebrow truncate", isPeerOnline ? "text-live" : "text-ink-faint")}>
							{peerStatus}
						</span>
					)}
				</div>
			</div>

			{onOpenMessageSearch && (
				<Button
					variant="ghost"
					onClick={onOpenMessageSearch}
					aria-label="Search in conversation"
					className="size-8 shrink-0 p-0"
				>
					<Search className="size-4" />
				</Button>
			)}

			{onToggleGroupMembers && (
				<Button
					variant="ghost"
					onClick={onToggleGroupMembers}
					aria-pressed={isManagingGroup}
					aria-expanded={Boolean(isManagingGroup)}
					aria-controls={isManagingGroup ? "conversation-details" : undefined}
					aria-label={conversation.isGroup ? "Group members" : "Conversation storage and details"}
					className={cn("size-8 shrink-0 p-0", isManagingGroup && "bg-ink/5 text-ink")}
				>
					<PanelRight className="size-4" />
				</Button>
			)}
		</header>
	);
}
