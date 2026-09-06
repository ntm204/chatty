import type { ConversationDTO } from "@chatty/shared-types";
import { ChevronLeft, ChevronRight, Pin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/button";
import { Disclosure } from "@/components/disclosure";
import { VAULT_CATEGORY_TABS, VAULT_TABS, type VaultTab } from "../constants/vault";
import { useConversationVault } from "../hooks/use-conversation-vault";
import { getDirectPeer } from "../utils";
import { ConversationBlockControl } from "./conversation-block-control";
import { ConversationCustomizePanel } from "./conversation-customize-panel";
import { ConversationDetailsIdentity } from "./conversation-details-identity";
import { ConversationQuickActions } from "./conversation-quick-actions";
import { GroupInvitePolicyControl } from "./group-invite-policy-control";
import { PinnedMessagesDialog } from "./pinned-messages-dialog";
import { PanelResizeHandle } from "./panel-resize-handle";
import { GroupMembersPanel } from "./group-members-panel";
import { VaultCategoryList } from "./vault-category-list";
import { VaultTabContent } from "./vault-tab-content";

interface ConversationVaultPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	onClose: () => void;
	onOpenSearch: () => void;
	onOpenMessage: (messageId: string) => void;
}

/** Conversation details dock beside the thread, or replace it on narrow screens. */
export function ConversationVaultPanel({
	conversation,
	currentUserId,
	onlineUserIds,
	onClose,
	onOpenSearch,
	onOpenMessage,
}: ConversationVaultPanelProps) {
	const panelRef = useRef<HTMLElement>(null);
	const [activeTab, setActiveTab] = useState<VaultTab | null>(null);
	const [isPinsDialogOpen, setIsPinsDialogOpen] = useState(false);
	// Lifted rather than left to Disclosure's own state: selecting a category
	// unmounts this overview, and an uncontrolled Disclosure would reset to
	// collapsed every time "Back" remounts it.
	const [isVaultSectionOpen, setIsVaultSectionOpen] = useState(false);
	const vault = useConversationVault(conversation.id, activeTab);
	const blockablePeer = conversation.isGroup ? null : getDirectPeer(conversation, currentUserId);
	const activeLabel = VAULT_TABS.find((tab) => tab.id === activeTab)?.label ?? "";
	const isAdmin = conversation.participants.find((participant) => participant.id === currentUserId)?.role === "admin";

	useEffect(() => {
		const panel = panelRef.current;
		// Narrow layouts hide the opener before this effect can read activeElement.
		const previousFocus =
			panel?.parentElement?.querySelector<HTMLElement>('[aria-controls="conversation-details"]') ??
			document.activeElement;
		panel?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });

		return () => {
			// Restore the opener only when focus has not moved into another panel.
			if (
				previousFocus instanceof HTMLElement &&
				previousFocus.isConnected &&
				(panel?.contains(document.activeElement) || document.activeElement === document.body)
			) {
				previousFocus.focus({ preventScroll: true });
			}
		};
	}, []);

	return (
		<aside
			ref={panelRef}
			aria-label="Conversation details"
			id="conversation-details"
			className="conversation-details-panel relative flex min-h-0 w-full shrink-0 flex-col bg-paper-raised lg:rounded-xl lg:border lg:border-rule xl:w-[var(--panel-width,320px)]"
		>
			<PanelResizeHandle
				panelId="conversation-details"
				label="Resize conversation details"
				edge="left"
				defaultWidth={320}
				minWidth={280}
				maxWidth={400}
				className="hidden xl:block"
			/>
			<div className="relative flex h-[70px] shrink-0 items-center border-b border-rule px-5">
				{activeTab && (
					<Button
						variant="ghost"
						onClick={() => setActiveTab(null)}
						aria-label="Back to conversation details"
						className="absolute left-3 size-8 p-0"
					>
						<ChevronLeft className="size-4" />
					</Button>
				)}
				<h2 className={cn("pr-10 text-sm font-semibold text-ink", activeTab && "pl-9")}>
					{activeTab ? activeLabel : "Conversation details"}
				</h2>
				<Button
					variant="ghost"
					onClick={onClose}
					aria-label="Close conversation storage"
					className="absolute right-3 size-8 p-0"
				>
					<X className="size-4" />
				</Button>
			</div>

			{!activeTab && (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<ConversationDetailsIdentity
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
					/>
					<ConversationQuickActions conversation={conversation} onOpenSearch={onOpenSearch} />

					<div className="px-3 pt-4">
						<h3 className="mb-2 px-3 text-xs font-medium text-ink-faint">Chat info</h3>
						<Button
							variant="ghost"
							onClick={() => setIsPinsDialogOpen(true)}
							className="min-h-12 w-full justify-start gap-3 px-3 text-left font-normal"
						>
							<Pin className="size-4 text-ink-soft" />
							<span className="flex-1 text-sm">Pinned messages</span>
							<span className="meta text-ink-faint">{conversation.pinnedMessages.length}</span>
							<ChevronRight className="size-4 text-ink-faint" />
						</Button>
					</div>

					{/* Content → people → settings → safety: what this chat holds, who is
					    in it, how it is configured, and only then the rare, sensitive
					    controls — rather than interleaving settings between content. */}
					<div className="mx-3 mt-3 border-t border-rule-soft py-1">
						<Disclosure label="Customize chat" defaultOpen>
							<ConversationCustomizePanel
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={onlineUserIds}
								isAdmin={isAdmin}
							/>
						</Disclosure>
					</div>

					<div className="mx-3 mt-1 border-t border-rule-soft py-1">
						<Disclosure
							label="Media, files and links"
							isOpen={isVaultSectionOpen}
							onOpenChange={setIsVaultSectionOpen}
						>
							<VaultCategoryList summary={vault.summary} memberCount={null} onSelect={setActiveTab} />
						</Disclosure>
					</div>

					{conversation.isGroup && (
						<div className="mx-3 mt-1 border-t border-rule-soft py-1">
							<Disclosure label="Members">
								<GroupMembersPanel
									conversation={conversation}
									currentUserId={currentUserId}
									onClose={onClose}
									isEmbedded
								/>
							</Disclosure>
						</div>
					)}

					{conversation.isGroup && (
						<div className="mx-3 mt-1 border-t border-rule-soft py-1">
							<Disclosure label="Group options">
								<div className="px-3 py-2">
									<GroupInvitePolicyControl
										conversationId={conversation.id}
										policy={conversation.invitePolicy}
										isAdmin={isAdmin}
									/>
								</div>
							</Disclosure>
						</div>
					)}

					{/* Last, not first. Direct conversations only: a block is between two
					    people and deliberately does not reach into a group they share. */}
					{blockablePeer && (
						<div className="mx-3 mt-1 border-t border-rule-soft py-1">
							<Disclosure label="Privacy & support">
								<ConversationBlockControl peer={blockablePeer} />
							</Disclosure>
						</div>
					)}
				</div>
			)}

			{activeTab && activeTab !== "members" && (
				<div className="flex min-h-0 flex-1 flex-col">
					<div
						role="tablist"
						aria-label="Shared content"
						className="flex shrink-0 gap-1 border-b border-rule px-3 py-2"
					>
						{VAULT_CATEGORY_TABS.map((tab) => (
							<Button
								key={tab.id}
								variant="ghost"
								role="tab"
								aria-selected={activeTab === tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									"px-2.5 py-1.5 text-[13px] font-medium",
									activeTab === tab.id ? "bg-paper-sunken text-ink" : "text-ink-faint",
								)}
							>
								{tab.label}
							</Button>
						))}
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
						<VaultTabContent
							activeTab={activeTab}
							attachments={vault.attachments}
							links={vault.links}
							isLoading={vault.isLoading}
							error={vault.error}
							hasMore={vault.hasMore}
							nextCursor={vault.nextCursor}
							loadMoreRef={vault.loadMoreRef}
							onLoadPage={vault.loadPage}
							onOpenMessage={onOpenMessage}
						/>
					</div>
				</div>
			)}

			{isPinsDialogOpen && (
				<PinnedMessagesDialog
					pinnedMessages={conversation.pinnedMessages}
					currentUserId={currentUserId}
					onClose={() => setIsPinsDialogOpen(false)}
					onOpenMessage={(messageId) => {
						setIsPinsDialogOpen(false);
						onOpenMessage(messageId);
					}}
				/>
			)}
		</aside>
	);
}
