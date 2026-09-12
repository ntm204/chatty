import type { UserDTO } from "@chatty/shared-types";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { cn } from "@/utils/cn";

interface ConversationBlockControlProps {
	peer: UserDTO;
}

/**
 * Blocking, behind the "Privacy & support" disclosure at the foot of the panel
 * — reachable deliberately, not the loudest thing on a panel about a person.
 * Blocking asks first; unblocking does not punish changing your mind.
 */
export function ConversationBlockControl({ peer }: ConversationBlockControlProps) {
	const isBlocked = useBlockedUsers((state) => state.blockedIds.has(peer.id));
	const load = useBlockedUsers((state) => state.load);
	const block = useBlockedUsers((state) => state.block);
	const unblock = useBlockedUsers((state) => state.unblock);
	const [isAsking, setIsAsking] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		void load(peer.id);
	}, [load, peer.id]);

	async function apply(shouldBlock: boolean) {
		if (isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await (shouldBlock ? block(peer.id) : unblock(peer.id));
			setIsAsking(false);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update block settings");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="shrink-0 pb-2">
			<Button
				variant="ghost"
				disabled={isSaving}
				onClick={() => {
					setError("");
					if (isBlocked) void apply(false);
					else setIsAsking(true);
				}}
				className={cn(
					"min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left text-[13.5px] font-normal",
					!isBlocked && "text-signal",
				)}
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
					<Ban className="size-4" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1 truncate">
					{isBlocked ? `Unblock ${peer.displayName}` : `Block ${peer.displayName}`}
				</span>
			</Button>

			{isAsking && (
				<ConfirmDialog
					title={`Block ${peer.displayName}?`}
					// Says what it does *and* what it does not. "Blocked" reads as total,
					// and somebody who shares a group with this person would otherwise
					// find the exception out at the worst moment.
					body={`Neither of you will be able to message the other, and you will stop appearing in each other's search. Messages you have already exchanged stay, and groups you are both in are not affected.`}
					confirmLabel="Block"
					isConfirming={isSaving}
					error={error}
					onConfirm={() => void apply(true)}
					onCancel={() => {
						setError("");
						setIsAsking(false);
					}}
				/>
			)}

			{error && !isAsking && (
				<p role="alert" className="mt-2 text-[13px] text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
