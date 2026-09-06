import type { ParticipantDTO } from "@chatty/shared-types";
import { MoreHorizontal, ShieldMinus, ShieldPlus, UserMinus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";

interface GroupMemberRowProps {
	participant: ParticipantDTO;
	isSelf: boolean;
	canChangeAdmin: boolean;
	canRemove: boolean;
	isChangingRole: boolean;
	isRemoving: boolean;
	onToggleAdmin: () => void;
	onRemove: () => void;
}

/**
 * One person in the group panel: their face, their name, and — for an admin
 * looking at somebody else — the two things they may do about them.
 *
 * The actions menu is portalled to `<body>` rather than expanded inline: an
 * inline menu pushed every row below it down the list, which read as the
 * panel rearranging itself under the reader. See conventions/frontend.md.
 *
 * Split out of `GroupMembersPanel` when that file went over the 300-line limit.
 * The panel keeps every piece of state and every request; this renders a row.
 */
export function GroupMemberRow({
	participant,
	isSelf,
	canChangeAdmin,
	canRemove,
	isChangingRole,
	isRemoving,
	onToggleAdmin,
	onRemove,
}: GroupMemberRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const isBusy = isChangingRole || isRemoving;
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

	useEffect(() => {
		if (!isExpanded) return;

		function closeFromOutside(event: PointerEvent) {
			if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node))
				setIsExpanded(false);
		}

		document.addEventListener("pointerdown", closeFromOutside);

		return () => document.removeEventListener("pointerdown", closeFromOutside);
	}, [isExpanded]);

	useLayoutEffect(() => {
		if (!isExpanded || !triggerRef.current || !menuRef.current) return;
		const triggerBounds = triggerRef.current.getBoundingClientRect();
		const menuBounds = menuRef.current.getBoundingClientRect();
		const gap = 4;
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
	}, [isExpanded]);

	return (
		<li className="flex items-center gap-2.5 rounded-panel px-1 py-2">
			<Avatar user={participant} size="sm" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="w-full truncate text-[13px] font-medium text-ink">
					{participant.nickname ?? participant.displayName}
					{isSelf && <span className="font-normal text-ink-faint"> (you)</span>}
					{participant.role === "admin" && (
						<span className="eyebrow ml-2 rounded-badge border border-rule px-1.5 py-0.5 text-ink-faint">
							Admin
						</span>
					)}
				</span>
				<span className="meta w-full truncate text-ink-faint">@{participant.handle}</span>
			</span>

			{/* No remove button on your own row — leaving has its own clearly-labelled
			    action below the list, so a small × next to your own name cannot be
			    clicked by accident. */}
			{!isSelf && (canChangeAdmin || canRemove) && (
				<>
					<Button
						variant="ghost"
						aria-label={`Actions for ${participant.displayName}`}
						aria-haspopup="menu"
						aria-expanded={isExpanded}
						disabled={isBusy}
						onClick={(event) => {
							triggerRef.current = event.currentTarget;
							setIsExpanded((current) => !current);
						}}
						className="size-8 shrink-0 p-0"
					>
						<MoreHorizontal className="size-4" />
					</Button>
					{isExpanded &&
						createPortal(
							<div
								ref={menuRef}
								role="menu"
								aria-label={`Actions for ${participant.displayName}`}
								style={menuPosition}
								className="fixed z-50 w-48 overflow-hidden rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
							>
								{canChangeAdmin && (
									<Button
										variant="ghost"
										role="menuitem"
										onClick={() => {
											setIsExpanded(false);
											onToggleAdmin();
										}}
										disabled={isChangingRole}
										aria-label={`${participant.role === "admin" ? "Remove" : "Make"} ${participant.displayName} ${participant.role === "admin" ? "from the admins" : "an admin"}`}
										className="w-full justify-start px-2.5 py-2 text-xs"
									>
										{participant.role === "admin" ? (
											<ShieldMinus className="size-4" />
										) : (
											<ShieldPlus className="size-4" />
										)}
										{participant.role === "admin" ? "Remove admin role" : "Make admin"}
									</Button>
								)}
								{canRemove && (
									<Button
										variant="ghost"
										role="menuitem"
										onClick={() => {
											setIsExpanded(false);
											onRemove();
										}}
										disabled={isRemoving}
										aria-label={`Remove ${participant.displayName} from the group`}
										className="w-full justify-start px-2.5 py-2 text-xs"
									>
										<UserMinus className="size-4" /> Remove from group
									</Button>
								)}
							</div>,
							document.body,
						)}
				</>
			)}
		</li>
	);
}
