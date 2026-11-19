import type { ConversationDTO } from "@chatty/shared-types";
import { ChevronLeft, ChevronRight, Pin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/button";
import { Disclosure } from "@/components/disclosure";
import { VAULT_CATEGORY_TABS, VAULT_TABS, type VaultTab } from "../constants/vault";
import { useConversationVault } from "../hooks/use-conversation-vault";
import { useVaultReadingPosition } from "../hooks/use-vault-reading-position";
import { getDirectPeer, isSavedConversation } from "../../utils";
import { getGroupPermissions } from "../utils/group-permissions";
import { ConversationBlockControl } from "./conversation-block-control";
import { ConversationCustomizePanel } from "./conversation-customize-panel";
import { ConversationMessageTimerControl } from "./conversation-message-timer-control";
import { ConversationSharingControl } from "./conversation-sharing-control";
import { ConversationDetailsIdentity } from "./conversation-details-identity";
import { ConversationQuickActions } from "./conversation-quick-actions";
import { GroupPermissionsControl } from "./group-permissions-control";
import { FriendshipActions } from "../../friends/components";
import { AddGroupMembersDialog } from "./add-group-members-dialog";
import { PanelResizeHandle } from "../../components/panel-resize-handle";
import { PinnedMessagesDialog } from "../../components/pinned-messages-dialog";
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
	const categoryScrollRef = useRef<HTMLDivElement>(null);
	const [activeTab, setActiveTab] = useState<VaultTab | null>(null);
	const [isPinsDialogOpen, setIsPinsDialogOpen] = useState(false);
	// Lifted rather than left to Disclosure's own state: selecting a category
	// unmounts this overview, and an uncontrolled Disclosure would reset to
	// collapsed every time "Back" remounts it.
	const [isVaultSectionOpen, setIsVaultSectionOpen] = useState(false);
	const vault = useConversationVault(conversation.id, activeTab);
	const blockablePeer = conversation.isGroup ? null : getDirectPeer(conversation, currentUserId);
	const activeLabel = VAULT_TABS.find((tab) => tab.id === activeTab)?.label ?? "";
	const permissions = getGroupPermissions(conversation, currentUserId);
	const [isAddingPeople, setIsAddingPeople] = useState(false);
	const rememberPosition = useVaultReadingPosition(
		categoryScrollRef,
		activeTab,
		vault.isLoading,
		activeTab === "links" ? vault.links : vault.attachments,
	);

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
			{/* The overview has no title bar, as on Messenger — the face and name are the
			    heading people see; the panel name stays for assistive technology. A
			    category page gets a compact bar with its own back button. */}
			{activeTab ? (
				<div className="relative flex h-14 shrink-0 items-center border-b border-rule-soft px-3">
					<Button
						variant="ghost"
						onClick={() => setActiveTab(null)}
						aria-label="Back to conversation details"
						className="size-9 rounded-full p-0"
					>
						<ChevronLeft className="size-[18px]" />
					</Button>
					<h2 className="ml-1 text-[15px] font-semibold text-ink">{activeLabel}</h2>
				</div>
			) : (
				<h2 className="sr-only">Conversation details</h2>
			)}
			<Button
				variant="ghost"
				onClick={onClose}
				aria-label="Close conversation storage"
				className="absolute top-2.5 right-2.5 z-10 size-9 rounded-full p-0 text-ink-soft hover:bg-paper-sunken hover:text-ink"
			>
				<X className="size-[18px]" />
			</Button>

			{!activeTab && (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<ConversationDetailsIdentity
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
					/>
					{blockablePeer && (
						<FriendshipActions user={blockablePeer} className="mx-auto w-full max-w-[300px] px-5 pb-4" />
					)}
					<ConversationQuickActions
						conversation={conversation}
						onOpenSearch={onOpenSearch}
						onAddPeople={permissions.canInvite ? () => setIsAddingPeople(true) : undefined}
					/>

					{/* Messenger's order — what the chat holds, how it looks, who is in it,
					    who may do what, then the rare and sensitive controls — as quiet
					    collapsible sections with no rules between them. */}
					<div className="flex flex-col gap-0.5 px-2 pb-6">
						<Disclosure label="Chat info" defaultOpen>
							<Button
								variant="ghost"
								onClick={() => setIsPinsDialogOpen(true)}
								className="min-h-11 w-full justify-start gap-3 rounded-control px-3 py-2 text-left font-normal"
							>
								<Pin className="size-[18px] shrink-0 text-ink-soft" aria-hidden="true" />
								<span className="min-w-0 flex-1 text-[14px] text-ink">Pinned messages</span>
								<span className="meta text-ink-faint">{conversation.pinnedMessages.length}</span>
								<ChevronRight className="size-4 text-ink-faint" />
							</Button>
						</Disclosure>

						<Disclosure label="Customize chat" defaultOpen>
							<ConversationCustomizePanel
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={onlineUserIds}
								canEditInfo={permissions.canEditInfo}
							/>
						</Disclosure>

						{conversation.isGroup && (
							<Disclosure label={`Chat members · ${conversation.participants.length}`}>
								<GroupMembersPanel
									conversation={conversation}
									currentUserId={currentUserId}
									onClose={onClose}
									isEmbedded
								/>
							</Disclosure>
						)}

						<Disclosure
							label="Media, files and links"
							isOpen={isVaultSectionOpen}
							onOpenChange={setIsVaultSectionOpen}
						>
							<VaultCategoryList summary={vault.summary} memberCount={null} onSelect={setActiveTab} />
						</Disclosure>

						{conversation.isGroup && (
							<Disclosure label="Group permissions">
								<div className="px-3 py-1">
									<GroupPermissionsControl
										conversation={conversation}
										isAdmin={permissions.isAdmin}
									/>
								</div>
							</Disclosure>
						)}

						{/* Last, not first. Blocking is direct-only: a block is between two
						    people and deliberately does not reach into a group they share.
						    Your own Saved chat has nobody to keep anything private from. */}
						{!isSavedConversation(conversation, currentUserId) && (
							<Disclosure label="Privacy & support">
								<div className="px-3">
									<ConversationMessageTimerControl
										conversationId={conversation.id}
										timer={conversation.messageTimerSeconds}
										canChange={!conversation.isGroup || permissions.isAdmin}
									/>
									<ConversationSharingControl
										conversationId={conversation.id}
										isRestricted={conversation.isSharingRestricted}
										canChange={!conversation.isGroup || permissions.isAdmin}
									/>
								</div>
								{blockablePeer && <ConversationBlockControl peer={blockablePeer} />}
							</Disclosure>
						)}
					</div>
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
					<div
						ref={categoryScrollRef}
						onScroll={rememberPosition}
						className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
					>
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

			{isAddingPeople && (
				<AddGroupMembersDialog
					conversationId={conversation.id}
					participantIds={conversation.participants.map((participant) => participant.id)}
					canInvite={permissions.canInvite}
					onClose={() => setIsAddingPeople(false)}
				/>
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
			{/* Last, not first: `#conversation-details > div:first-of-type` styles the header. */}
			<PanelResizeHandle
				panelId="conversation-details"
				label="Resize conversation details"
				edge="left"
				defaultWidth={320}
				minWidth={280}
				maxWidth={480}
				className="hidden xl:block"
			/>
		</aside>
	);
}
