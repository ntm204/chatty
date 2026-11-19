import type { UserDTO } from "@chatty/shared-types";
import { ChevronDown, UserCheck, UserMinus, UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/utils/cn";
import { useRelationship } from "../hooks/use-relationship";

interface FriendshipActionsProps {
	user: UserDTO;
	className?: string;
}

/**
 * Facebook's profile buttons for one person: Add friend → Cancel request;
 * Confirm / Delete for a request they sent you; Friends ▾ (unfollow,
 * unfriend) once you are; and Follow beside it while you are not friends.
 */
export function FriendshipActions({ user, className }: FriendshipActionsProps) {
	const { relationship, isBusy, error, run } = useRelationship(user.id);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isConfirmingUnfriend, setIsConfirmingUnfriend] = useState(false);
	if (!relationship) return <div className={cn("h-9", className)} aria-hidden="true" />;

	const { isFriend, isFollowing, request, mutualFriendCount } = relationship;
	const chip = "h-9 flex-1 gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px]";

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex gap-2">
				{isFriend ? (
					<div className="relative flex-1">
						<Button
							variant="outline"
							onClick={() => setIsMenuOpen((current) => !current)}
							aria-haspopup="menu"
							aria-expanded={isMenuOpen}
							disabled={isBusy}
							className={cn(chip, "w-full border-rule")}
						>
							<UserCheck className="size-4" />
							Friends
							<ChevronDown className="size-3.5" />
						</Button>
						{isMenuOpen && (
							<div
								role="menu"
								aria-label={`${user.displayName} friendship`}
								className="popover-enter absolute top-full left-0 z-30 mt-1.5 w-full min-w-48 rounded-2xl bg-paper-raised p-1.5 shadow-lift"
							>
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => {
										setIsMenuOpen(false);
										void run(isFollowing ? api.unfollow : api.follow);
									}}
									className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-ink"
								>
									<UserMinus className="size-4 text-ink-faint" />
									{isFollowing ? "Unfollow" : "Follow"}
								</Button>
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => {
										setIsMenuOpen(false);
										setIsConfirmingUnfriend(true);
									}}
									className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-normal text-signal"
								>
									<UserX className="size-4" />
									Unfriend
								</Button>
							</div>
						)}
					</div>
				) : request === "incoming" ? (
					<>
						<Button onClick={() => void run(api.acceptFriendRequest)} disabled={isBusy} className={chip}>
							<UserCheck className="size-4" />
							Confirm
						</Button>
						<Button
							variant="outline"
							onClick={() => void run(api.declineFriendRequest)}
							disabled={isBusy}
							className={cn(chip, "border-rule")}
						>
							Delete
						</Button>
					</>
				) : request === "outgoing" ? (
					<Button
						variant="outline"
						onClick={() => void run(api.cancelFriendRequest)}
						disabled={isBusy}
						className={cn(chip, "border-rule")}
					>
						<UserX className="size-4" />
						Cancel request
					</Button>
				) : (
					<Button onClick={() => void run(api.sendFriendRequest)} disabled={isBusy} className={chip}>
						<UserPlus className="size-4" />
						Add friend
					</Button>
				)}

				{!isFriend && request !== "incoming" && (
					<Button
						variant="outline"
						onClick={() => void run(isFollowing ? api.unfollow : api.follow)}
						aria-pressed={isFollowing}
						disabled={isBusy}
						className={cn(chip, "flex-none border-rule px-4")}
					>
						{isFollowing ? "Following" : "Follow"}
					</Button>
				)}
			</div>

			{(mutualFriendCount > 0 || request === "incoming") && (
				<p className="text-center text-[12px] text-ink-faint">
					{request === "incoming" ? `${user.displayName} sent you a friend request` : ""}
					{request === "incoming" && mutualFriendCount > 0 ? " · " : ""}
					{mutualFriendCount > 0 &&
						`${mutualFriendCount} mutual ${mutualFriendCount === 1 ? "friend" : "friends"}`}
				</p>
			)}
			{error && (
				<p role="alert" className="text-center text-[12px] text-signal">
					{error}
				</p>
			)}

			{/* On the body, not in place: the details panel scrolls and would clip a fixed overlay. */}
			{isConfirmingUnfriend &&
				createPortal(
					<ConfirmDialog
						title={`Unfriend ${user.displayName}?`}
						body="You'll stop following each other. They won't be told."
						confirmLabel="Unfriend"
						isConfirming={isBusy}
						onConfirm={() => {
							void run(api.unfriend).then(() => setIsConfirmingUnfriend(false));
						}}
						onCancel={() => setIsConfirmingUnfriend(false)}
					/>,
					document.body,
				)}
		</div>
	);
}
