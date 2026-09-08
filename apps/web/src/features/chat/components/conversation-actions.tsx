import type { ConversationDTO } from "@chatty/shared-types";
import { BellOff, MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { cn } from "@/utils/cn";
import { getDirectPeer, isConversationMuted } from "../utils";
import { ConversationActionsMenu } from "./conversation-actions-menu";
import { ConversationMuteMenu } from "./conversation-mute-menu";

interface ConversationActionsProps {
	conversation: ConversationDTO;
	/** Needed only to find the other person in a direct conversation. */
	currentUserId: string;
}

export function ConversationActions({ conversation, currentUserId }: ConversationActionsProps) {
	// Blocking and restricting apply to a person, so they are offered on direct rows only.
	const peer = conversation.isGroup ? null : getDirectPeer(conversation, currentUserId);
	const isBlocked = useBlockedUsers((state) => Boolean(peer && state.blockedIds.has(peer.id)));
	const loadBlocked = useBlockedUsers((state) => state.load);
	const blockUser = useBlockedUsers((state) => state.block);
	const unblockUser = useBlockedUsers((state) => state.unblock);
	const isRestricted = useRestrictedUsers((state) => Boolean(peer && state.restrictedIds.has(peer.id)));
	const loadRestricted = useRestrictedUsers((state) => state.load);
	const restrictUser = useRestrictedUsers((state) => state.restrict);
	const unrestrictUser = useRestrictedUsers((state) => state.unrestrict);
	const [isOpen, setIsOpen] = useState(false);
	const [isChoosingMute, setIsChoosingMute] = useState(false);
	const [isConfirmingBlock, setIsConfirmingBlock] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
	const isMuted = isConversationMuted(conversation);

	useEffect(() => {
		// On open rather than on mount: the sidebar renders one of these per row
		// and only ever opens one, so mounting is the wrong moment to ask.
		if (!isOpen || !peer) return;
		void loadBlocked(peer.id);
		void loadRestricted(peer.id);
	}, [isOpen, loadBlocked, loadRestricted, peer]);

	useEffect(() => {
		if (!isOpen) return;
		const focusFrame = window.requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
		});

		function closeFromOutside(event: Event) {
			if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node))
				close();
		}
		function closeFromKeyboard(event: KeyboardEvent) {
			// A portalled menu is last in the document: native Tab can move into
			// browser chrome without a focusin event. Resume the row's tab order.
			if (event.key === "Tab" && menuRef.current?.contains(document.activeElement)) {
				close();
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}
			if (event.key === "Escape") {
				close();
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}

			if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			const items = [...menuRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
			if (items.length === 0) return;
			event.preventDefault();
			const currentIndex = items.findIndex((item) => item === document.activeElement);
			if (event.key === "Home") items[0]?.focus();
			else if (event.key === "End") items[items.length - 1]?.focus();
			else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
			else items[(currentIndex - 1 + items.length) % items.length]?.focus();
		}
		document.addEventListener("pointerdown", closeFromOutside);
		document.addEventListener("focusin", closeFromOutside);
		document.addEventListener("keydown", closeFromKeyboard);

		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("pointerdown", closeFromOutside);
			document.removeEventListener("focusin", closeFromOutside);
			document.removeEventListener("keydown", closeFromKeyboard);
		};
	}, [isOpen, isChoosingMute]);

	useLayoutEffect(() => {
		if (!isOpen || !rootRef.current || !menuRef.current) return;
		const trigger = rootRef.current.querySelector("button");
		if (!trigger) return;
		const triggerBounds = trigger.getBoundingClientRect();
		const menuBounds = menuRef.current.getBoundingClientRect();
		const gap = 8;
		setMenuPosition({
			left: Math.max(
				gap,
				Math.min(window.innerWidth - menuBounds.width - gap, triggerBounds.right - menuBounds.width),
			),
			top:
				triggerBounds.bottom + gap + menuBounds.height <= window.innerHeight
					? triggerBounds.bottom + gap
					: Math.max(gap, triggerBounds.top - menuBounds.height - gap),
		});
	}, [error, isChoosingMute, isOpen]);

	function close(): void {
		setIsOpen(false);
		setIsChoosingMute(false);
		setError("");
	}

	async function update(action: () => Promise<unknown>): Promise<void> {
		if (isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await action();
			close();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update conversation");
		} finally {
			setIsSaving(false);
		}
	}

	function muteFor(milliseconds: number | null): void {
		const until =
			milliseconds === null ? "9999-12-31T23:59:59.999Z" : new Date(Date.now() + milliseconds).toISOString();
		void update(() => api.setConversationMuted(conversation.id, until));
	}

	async function confirmBlock(): Promise<void> {
		if (!peer || isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await blockUser(peer.id);
			setIsConfirmingBlock(false);
			close();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update conversation");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div ref={rootRef} className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1">
			<Button
				variant="ghost"
				onClick={() => {
					const nextIsOpen = !isOpen;
					setIsOpen(nextIsOpen);
					setIsChoosingMute(false);
				}}
				aria-label="Conversation actions"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={cn(
					"size-7 rounded-full p-0 text-ink-faint opacity-0 transition-opacity hover:bg-transparent hover:text-ink",
					"group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70",
					isOpen && "bg-paper-raised text-ink opacity-100 shadow-sm",
				)}
			>
				<MoreHorizontal className="size-4" />
			</Button>
			{isMuted && <BellOff role="img" aria-label="Muted" className="size-3.5 shrink-0 text-ink-faint" />}

			{isOpen &&
				createPortal(
					<div
						ref={menuRef}
						role="menu"
						aria-label="Conversation actions"
						aria-busy={isSaving}
						style={menuPosition}
						className="fixed z-50 w-52 overflow-hidden rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
					>
						{isChoosingMute ? (
							<ConversationMuteMenu
								isMuted={isMuted}
								isSaving={isSaving}
								onBack={() => setIsChoosingMute(false)}
								onUnmute={() => void update(() => api.setConversationMuted(conversation.id, null))}
								onMuteFor={muteFor}
							/>
						) : (
							<ConversationActionsMenu
								isPinned={conversation.isPinned}
								isArchived={conversation.isArchived}
								isMuted={isMuted}
								peer={peer}
								isRestricted={isRestricted}
								isBlocked={isBlocked}
								isSaving={isSaving}
								onTogglePin={() =>
									void update(() =>
										api.setConversationPinned(conversation.id, !conversation.isPinned),
									)
								}
								onToggleArchive={() =>
									void update(() =>
										api.setConversationArchived(conversation.id, !conversation.isArchived),
									)
								}
								onChooseMute={() => setIsChoosingMute(true)}
								onToggleRestrict={() =>
									void update(() =>
										peer
											? isRestricted
												? unrestrictUser(peer.id)
												: restrictUser(peer.id)
											: Promise.resolve(),
									)
								}
								onUnblock={() => void update(() => (peer ? unblockUser(peer.id) : Promise.resolve()))}
								onRequestBlock={() => {
									setIsOpen(false);
									setIsConfirmingBlock(true);
								}}
							/>
						)}
						{error && (
							<p role="alert" className="border-t border-rule-soft px-2.5 py-2 text-xs text-signal">
								{error}
							</p>
						)}
					</div>,
					document.body,
				)}

			{isConfirmingBlock && peer && (
				<ConfirmDialog
					title={`Block ${peer.displayName}?`}
					body={`Neither of you will be able to message the other, and you will stop appearing in each other's search. Messages you have already exchanged stay, and groups you are both in are not affected.`}
					confirmLabel="Block"
					isConfirming={isSaving}
					error={error}
					onConfirm={() => void confirmBlock()}
					onCancel={() => {
						setError("");
						setIsConfirmingBlock(false);
					}}
				/>
			)}
		</div>
	);
}
