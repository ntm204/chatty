import type { ConversationDTO, CurrentUserDTO } from "@chatty/shared-types";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import type { ConversationPaging } from "../../types/conversation-paging";
import { PanelResizeHandle } from "../../components/panel-resize-handle";
import { ConversationList } from "./conversation-list";
import { NewConversationPanel } from "./new-conversation-panel";
import { SidebarMenu } from "./sidebar-menu";
import { isSavedConversation } from "../../utils/is-saved-conversation";
import { useState } from "react";
import type { ChatFolder } from "../types/conversation-list";
import { isInFolder } from "../utils/filter-by-folder";
import { ChatFolderTabs } from "./chat-folder-tabs";
import { ARCHIVE_EMPTY_STATE, FOLDER_EMPTY_STATES } from "../constants/conversation-list";

interface ConversationSidebarProps {
	currentUser: CurrentUserDTO;
	conversations: ConversationDTO[];
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	onConversationStarted: (conversationId: string, conversation?: ConversationDTO) => void;
	onSignOut: () => void;
	onOpenMessageSearch: () => void;
	onShowKeyboardShortcuts?: () => void;
	onOpenBookmarkedMessage: (conversation: ConversationDTO, messageId: string) => void;
	isShowingArchived: boolean;
	onToggleArchived: () => void;
	typingByConversation: Record<string, string[]>;
	paging: ConversationPaging;
	className?: string;
}

/**
 * The left column: the wordmark, the search, the list, and you.
 *
 * Split out of `ChatPage` because that file was carrying the whole socket state
 * machine as well as two screens' worth of markup and had grown past the point
 * where either could be read without scrolling past the other. Every piece of
 * state still lives in the page; this only renders it.
 */
export function ConversationSidebar({
	currentUser,
	conversations,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	onConversationStarted,
	onSignOut,
	onOpenMessageSearch,
	onShowKeyboardShortcuts,
	onOpenBookmarkedMessage,
	isShowingArchived,
	onToggleArchived,
	typingByConversation,
	paging,
	className,
}: ConversationSidebarProps) {
	const [folder, setFolder] = useState<ChatFolder>("all");

	return (
		<aside
			id="conversation-sidebar"
			className={cn(
				"conversation-sidebar relative flex w-full shrink-0 flex-col bg-paper-raised lg:w-[var(--panel-width,320px)] lg:rounded-xl lg:border lg:border-rule",
				className,
			)}
		>
			<PanelResizeHandle
				panelId="conversation-sidebar"
				label="Resize conversation sidebar"
				edge="right"
				defaultWidth={320}
				minWidth={260}
				maxWidth={400}
				className="hidden lg:block"
			/>
			{/* One row, as in Telegram: the mark, then the two actions. The list is
			    the page's subject, so its heading is for assistive technology only;
			    a 70px "Chats" title under the logo said the same thing twice. */}
			<div className="sidebar-brand">
				<Brand />
				<h1 className="sr-only">{isShowingArchived ? "Archived chats" : "Chats"}</h1>
				<span className="ml-auto flex items-center gap-1.5">
					<SidebarMenu
						currentUserId={currentUser.id}
						onOpenNotes={onConversationStarted}
						onOpenBookmarkedMessage={onOpenBookmarkedMessage}
						onShowArchived={() => {
							if (!isShowingArchived) onToggleArchived();
						}}
						onShowKeyboardShortcuts={onShowKeyboardShortcuts}
					/>
					<Button
						variant="ghost"
						className="sidebar-brand-label"
						onClick={() => document.getElementById("global-conversation-search")?.focus()}
					>
						New chat
					</Button>
				</span>
			</div>

			<NewConversationPanel
				onConversationStarted={onConversationStarted}
				onOpenMessageSearch={onOpenMessageSearch}
			/>

			{!isShowingArchived && (
				<ChatFolderTabs
					folder={folder}
					unreadCount={conversations.filter((conversation) => conversation.unreadCount > 0).length}
					onChange={setFolder}
				/>
			)}
			{isShowingArchived && (
				<Button
					variant="ghost"
					onClick={onToggleArchived}
					aria-label="Back to conversations"
					className="mx-2 h-9 shrink-0 justify-start gap-2 rounded-lg px-2.5 text-[13px] font-semibold text-ink hover:bg-paper-sunken"
				>
					<ArrowLeft className="size-4" />
					Archived chats
				</Button>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto">
				<ConversationList
					conversations={conversations.filter(
						(conversation) =>
							!isSavedConversation(conversation, currentUser.id) &&
							(isShowingArchived || isInFolder(conversation, folder)),
					)}
					currentUserId={currentUser.id}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={onSelect}
					typingByConversation={typingByConversation}
					paging={paging}
					{...(isShowingArchived
						? { emptyState: ARCHIVE_EMPTY_STATE }
						: folder !== "all" && { emptyState: FOLDER_EMPTY_STATES[folder] })}
				/>
			</div>

			{/* Pinned to the bottom, where an account lives in every application
			    shell people already use. It sat in the header before, which put the
			    thing you touch least at the top of the thing you scan most. */}
			<div className="sidebar-account flex shrink-0 items-center gap-1 border-t border-rule-soft py-2 pr-2 pl-1.5">
				{/* The whole profile opens the settings, as in every messenger. */}
				<Link
					to="/profile"
					// Keeps the open thread behind the dialog and lets closing return to it.
					state={{ conversationId: selectedConversationId }}
					aria-label="Account settings"
					className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 transition hover:bg-ink/5"
				>
					<Avatar user={currentUser} size="md" />
					<span className="min-w-0 flex-1">
						<span className="font-content block truncate text-[13px] leading-tight font-semibold text-ink">
							{currentUser.displayName}
						</span>
						<span className="meta block truncate text-ink-faint">@{currentUser.handle}</span>
					</span>
				</Link>
				<Button variant="ghost" onClick={onSignOut} aria-label="Sign out" className="size-8 shrink-0 p-0">
					<LogOut className="size-4" />
				</Button>
			</div>
		</aside>
	);
}
