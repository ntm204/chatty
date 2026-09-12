import type { ConversationDTO, ConversationRole, UserDTO } from "@chatty/shared-types";
import { useState } from "react";
import { LogOut, UserPlus, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TextField } from "@/components/text-field";
import { cn } from "@/utils/cn";
import { AddGroupMembersDialog } from "./add-group-members-dialog";
import { GroupMemberRow } from "./group-member-row";

interface GroupMembersPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onClose: () => void;
	isEmbedded?: boolean;
}

/**
 * The member list and moderation controls. Any admin has equal standing over
 * any other — see ADR 0021. Renaming, invite policy and the rest of
 * "Customize chat" live in their own sections above this one — see ADR 0022.
 */
export function GroupMembersPanel({
	conversation,
	currentUserId,
	onClose,
	isEmbedded = false,
}: GroupMembersPanelProps) {
	const [memberQuery, setMemberQuery] = useState("");
	const [removingUserId, setRemovingUserId] = useState<string | null>(null);
	const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
	const [isLeaving, setIsLeaving] = useState(false);
	const [actionError, setActionError] = useState("");
	// Who is about to be removed, and whether leaving is about to happen. Both
	// hold the *pending* decision — the action runs when the dialog confirms it,
	// which is the whole point of asking.
	const [memberPendingRemoval, setMemberPendingRemoval] = useState<UserDTO | null>(null);
	const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);
	const [isAddOpen, setIsAddOpen] = useState(false);

	const currentRole = conversation.participants.find((participant) => participant.id === currentUserId)?.role;
	const isAdmin = currentRole === "admin";
	const canInvite = conversation.invitePolicy === "everyone" || isAdmin;

	async function handleRemoveMember(userId: string) {
		setMemberPendingRemoval(null);
		setRemovingUserId(userId);
		setActionError("");
		try {
			await api.removeParticipant(conversation.id, userId);
		} catch (removeError) {
			setActionError((removeError as Error).message);
		} finally {
			setRemovingUserId(null);
		}
	}

	async function handleToggleAdmin(userId: string, role: ConversationRole) {
		setChangingRoleUserId(userId);
		setActionError("");
		try {
			await api.setParticipantRole(conversation.id, userId, role === "admin" ? "member" : "admin");
		} catch (roleError) {
			setActionError((roleError as Error).message);
		} finally {
			setChangingRoleUserId(null);
		}
	}

	async function handleLeave() {
		setIsConfirmingLeave(false);
		setIsLeaving(true);
		setActionError("");
		try {
			await api.removeParticipant(conversation.id, currentUserId);
			// No local cleanup on success: this fires the same `conversation:left`
			// event a kick does, and the page reacts to that one event whether the
			// removal happened here, from another tab, or from someone else — one
			// code path, not this component racing to also deselect itself.
		} catch (leaveError) {
			setActionError((leaveError as Error).message);
			setIsLeaving(false);
		}
	}

	return (
		<div className={cn("shrink-0 bg-paper-raised", isEmbedded ? "px-0 py-1" : "border-b border-rule px-7 py-5")}>
			{!isEmbedded && (
				<div className="flex items-center justify-between">
					<h2 className="eyebrow text-ink-soft">Group members</h2>
					<Button variant="ghost" onClick={onClose} aria-label="Close group settings" className="size-8 p-0">
						<X className="size-4" />
					</Button>
				</div>
			)}

			{actionError && (
				<p role="alert" className="eyebrow mt-3 text-signal">
					{actionError}
				</p>
			)}

			{/* Three sections in the order Instagram puts them: who is here, how to
			    add someone, and only then the way out. Leaving used to sit between the
			    member list and the search box, so the most destructive control on the
			    panel was also the one the eye reached first on the way to the least. */}
			<section className="mt-1">
				{!isEmbedded && (
					<h3 className="text-xs font-medium text-ink-faint">Members · {conversation.participants.length}</h3>
				)}
				{conversation.participants.length > 6 && (
					<div className="mt-3 px-3">
						<TextField
							label="Find a member"
							value={memberQuery}
							onChange={(event) => setMemberQuery(event.target.value)}
						/>
					</div>
				)}
				<ul className="mt-2 flex flex-col gap-0.5 overflow-y-auto">
					{conversation.participants
						.filter((participant) =>
							`${participant.displayName} ${participant.handle}`
								.toLocaleLowerCase()
								.includes(memberQuery.trim().toLocaleLowerCase()),
						)
						.map((participant) => (
							<GroupMemberRow
								key={participant.id}
								participant={participant}
								isSelf={participant.id === currentUserId}
								canChangeAdmin={isAdmin && participant.id !== currentUserId}
								canRemove={isAdmin && participant.id !== currentUserId}
								isChangingRole={changingRoleUserId === participant.id}
								isRemoving={removingUserId === participant.id}
								onToggleAdmin={() => void handleToggleAdmin(participant.id, participant.role)}
								onRemove={() => setMemberPendingRemoval(participant)}
							/>
						))}
				</ul>
			</section>

			<div className="mt-1">
				<Button
					variant="ghost"
					onClick={() => setIsAddOpen(true)}
					disabled={!canInvite}
					className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
				>
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
						<UserPlus className="size-4 text-ink-soft" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1 truncate text-left text-[13.5px] text-ink">Add people</span>
				</Button>
				{!canInvite && <p className="mt-1 text-sm text-ink-soft">This group lets only admins add people.</p>}
			</div>

			{isAddOpen && (
				<AddGroupMembersDialog
					conversationId={conversation.id}
					participantIds={conversation.participants.map((participant) => participant.id)}
					onClose={() => setIsAddOpen(false)}
				/>
			)}

			{/* Ruled off rather than merely spaced: the two sections above are things
			    you do to the group, and this is the one you do to your own membership. */}
			<div className="mt-3 border-t border-rule-soft pt-2">
				<Button
					variant="ghost"
					onClick={() => setIsConfirmingLeave(true)}
					disabled={isLeaving}
					className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left text-[13.5px] font-normal text-signal"
				>
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
						<LogOut className="size-4" aria-hidden="true" />
					</span>
					Leave group
				</Button>
			</div>

			{memberPendingRemoval && (
				<ConfirmDialog
					title="Remove from the group?"
					body={`${memberPendingRemoval.displayName} will lose access to this conversation and everything in it. They can be added back under the current invite policy.`}
					confirmLabel="Remove"
					onConfirm={() => void handleRemoveMember(memberPendingRemoval.id)}
					onCancel={() => setMemberPendingRemoval(null)}
				/>
			)}

			{isConfirmingLeave && (
				<ConfirmDialog
					title="Leave this group?"
					body="You will stop receiving its messages and it will disappear from your list, including from your search. Somebody still in it can add you back."
					confirmLabel="Leave"
					onConfirm={() => void handleLeave()}
					onCancel={() => setIsConfirmingLeave(false)}
				/>
			)}
		</div>
	);
}
