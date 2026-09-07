import type { ConversationDTO, CurrentUserDTO } from "@chatty/shared-types";
import { Link } from "react-router-dom";
import { Archive, ArrowLeft, LogOut, Settings, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import type { ConversationPaging } from "../types/conversation-paging";
import { PanelResizeHandle } from "./panel-resize-handle";
import { ConversationList } from "./conversation-list";
import { NewConversationPanel } from "./new-conversation-panel";

interface ConversationSidebarProps {
	currentUser: CurrentUserDTO;
	conversations: ConversationDTO[];
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	onConversationStarted: (conversationId: string) => void;
	onSignOut: () => void;
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
	isShowingArchived,
	onToggleArchived,
	typingByConversation,
	paging,
	className,
}: ConversationSidebarProps) {
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
			<div className="sidebar-brand">
				<Brand />
				<span className="eyebrow">
					THE GOOD
					<br />
					COMPANY CLUB
				</span>
			</div>
			<div className="sidebar-heading flex h-[70px] shrink-0 items-center justify-between px-4">
				<h1 className="text-[25px] font-bold leading-none tracking-[-0.035em] text-ink">
					Chats
					<span className="sidebar-heading-star" aria-hidden="true">
						✳
					</span>
				</h1>
				<Button
					variant="ghost"
					onClick={onToggleArchived}
					aria-label={isShowingArchived ? "Back to conversations" : "Archived"}
					title={isShowingArchived ? "Back to conversations" : "Archived conversations"}
					className="size-9 rounded-full bg-paper-sunken p-0 text-ink-soft hover:text-ink"
				>
					{isShowingArchived ? <ArrowLeft className="size-4" /> : <Archive className="size-4" />}
				</Button>
			</div>

			<NewConversationPanel onConversationStarted={onConversationStarted} />

			<div className="sidebar-list-label">
				<span className="eyebrow">{isShowingArchived ? "Archived conversations" : "YOUR CONVERSATIONS"}</span>
				<Sparkles size={13} aria-hidden="true" />
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<ConversationList
					conversations={conversations}
					currentUserId={currentUser.id}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={onSelect}
					typingByConversation={typingByConversation}
					paging={paging}
				/>
			</div>

			{/* Pinned to the bottom, where an account lives in every application
			    shell people already use. It sat in the header before, which put the
			    thing you touch least at the top of the thing you scan most. */}
			<div className="sidebar-account flex shrink-0 items-center gap-3 border-t border-rule-soft px-4 py-3">
				<Avatar user={currentUser} size="md" />

				<div className="min-w-0 flex-1">
					<p className="truncate text-[13px] font-semibold leading-tight">{currentUser.displayName}</p>
					<p className="meta truncate text-ink-faint">@{currentUser.handle}</p>
				</div>

				<Link
					to="/profile"
					aria-label="Account settings"
					className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-soft transition hover:bg-ink/5 hover:text-ink"
				>
					<Settings className="size-4" />
				</Link>

				<Button variant="ghost" onClick={onSignOut} aria-label="Sign out" className="size-8 shrink-0 p-0">
					<LogOut className="size-4" />
				</Button>
			</div>
		</aside>
	);
}
