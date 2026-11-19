import type { FriendDTO, FriendRequestsDTO, RelationshipDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { useDialog } from "@/hooks/use-dialog";
import { getErrorMessage } from "@/utils/get-error-message";
import { formatRelativeTime } from "../../utils";
import { FRIENDS_TABS } from "../constants/friends";
import { usePeopleSearch } from "../hooks/use-people-search";
import type { FriendsTab } from "../types/friends";
import { FriendshipActions } from "./friendship-actions";
import { PersonRow } from "./person-row";

interface FriendsDialogProps {
	currentUserId: string;
	friends: FriendDTO[] | null;
	requests: FriendRequestsDTO | null;
	onClose: () => void;
}

/**
 * Facebook's Friends page in a dialog: requests waiting for you (and the ones
 * you sent), your friends, and a search to find someone new. It opens on
 * Requests when any are waiting.
 */
export function FriendsDialog({ currentUserId, friends, requests, onClose }: FriendsDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [tab, setTab] = useState<FriendsTab>((requests?.incoming.length ?? 0) > 0 ? "requests" : "friends");
	const [query, setQuery] = useState("");
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const { people, isSearching } = usePeopleSearch(query);

	async function act(userId: string, action: (id: string) => Promise<RelationshipDTO>) {
		setBusyId(userId);
		setError("");
		try {
			await action(userId);
		} catch (actionError) {
			setError(getErrorMessage(actionError, "That did not work. Try again."));
		} finally {
			setBusyId(null);
		}
	}

	const incoming = requests?.incoming ?? [];
	const outgoing = requests?.outgoing ?? [];

	return (
		<div
			className="backdrop-fade fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 sm:items-center sm:p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Friends"
				tabIndex={-1}
				className="dialog-enter flex h-[min(640px,92vh)] w-full flex-col overflow-hidden rounded-t-panel bg-paper-raised shadow-modal outline-none sm:max-w-md sm:rounded-panel"
			>
				<div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
					<h2 className="text-[18px] font-semibold text-ink">Friends</h2>
					<Button
						variant="ghost"
						aria-label="Close friends"
						onClick={onClose}
						className="size-9 rounded-full p-0"
					>
						<X className="size-[18px]" />
					</Button>
				</div>
				<div className="shrink-0 px-5 pb-3">
					<span id="friends-tabs" className="sr-only">
						Friends sections
					</span>
					<SegmentedControl options={FRIENDS_TABS} value={tab} onChange={setTab} labelledBy="friends-tabs" />
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
					{error && (
						<p role="alert" className="pb-2 text-[13px] text-signal">
							{error}
						</p>
					)}

					{tab === "requests" && (
						<>
							<h3 className="meta pt-1 font-medium text-ink-soft">
								{incoming.length > 0 ? `Friend requests · ${incoming.length}` : "Friend requests"}
							</h3>
							{incoming.length === 0 ? (
								<p className="py-6 text-center text-sm text-ink-faint">No requests right now.</p>
							) : (
								<ul aria-label="Friend requests">
									{incoming.map((item) => (
										<PersonRow
											key={item.user.id}
											user={item.user}
											detail={formatRelativeTime(item.createdAt)}
											actions={
												<>
													<Button
														onClick={() => void act(item.user.id, api.acceptFriendRequest)}
														disabled={busyId === item.user.id}
														aria-label={`Confirm ${item.user.displayName}`}
														className="h-8 rounded-full px-3.5 text-[13px]"
													>
														Confirm
													</Button>
													<Button
														variant="outline"
														onClick={() => void act(item.user.id, api.declineFriendRequest)}
														disabled={busyId === item.user.id}
														aria-label={`Delete request from ${item.user.displayName}`}
														className="h-8 rounded-full border-rule px-3.5 text-[13px]"
													>
														Delete
													</Button>
												</>
											}
										/>
									))}
								</ul>
							)}
							{outgoing.length > 0 && (
								<>
									<h3 className="meta pt-4 font-medium text-ink-soft">Sent · {outgoing.length}</h3>
									<ul aria-label="Sent requests">
										{outgoing.map((item) => (
											<PersonRow
												key={item.user.id}
												user={item.user}
												detail={`Sent ${formatRelativeTime(item.createdAt)}`}
												actions={
													<Button
														variant="outline"
														onClick={() => void act(item.user.id, api.cancelFriendRequest)}
														disabled={busyId === item.user.id}
														aria-label={`Cancel request to ${item.user.displayName}`}
														className="h-8 rounded-full border-rule px-3.5 text-[13px]"
													>
														Cancel
													</Button>
												}
											/>
										))}
									</ul>
								</>
							)}
						</>
					)}

					{tab === "friends" &&
						(friends === null ? (
							<p className="py-6 text-center text-sm text-ink-faint">Loading…</p>
						) : friends.length === 0 ? (
							<p className="py-6 text-center text-sm text-ink-faint">
								No friends yet. Find people you know and add them.
							</p>
						) : (
							<ul aria-label="Your friends">
								{friends.map((friend) => (
									<PersonRow
										key={friend.user.id}
										user={friend.user}
										actions={
											<Button
												variant="outline"
												onClick={() => void act(friend.user.id, api.unfriend)}
												disabled={busyId === friend.user.id}
												aria-label={`Unfriend ${friend.user.displayName}`}
												className="h-8 rounded-full border-rule px-3.5 text-[13px]"
											>
												Unfriend
											</Button>
										}
									/>
								))}
							</ul>
						))}

					{tab === "find" && (
						<>
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search by name or @handle"
								aria-label="Find people"
								maxLength={100}
								autoFocus
								className="mb-2 w-full rounded-control border border-rule bg-paper px-3 py-2 text-sm"
							/>
							{!query.trim() ? (
								<p className="py-6 text-center text-sm text-ink-faint">Search for someone to add.</p>
							) : isSearching && people.length === 0 ? (
								<p className="py-6 text-center text-sm text-ink-faint">Searching…</p>
							) : people.filter((person) => person.id !== currentUserId).length === 0 ? (
								<p className="py-6 text-center text-sm text-ink-faint">No one matches.</p>
							) : (
								<ul aria-label="People">
									{people
										.filter((person) => person.id !== currentUserId)
										.map((person) => (
											<PersonRow
												key={person.id}
												user={person}
												isStacked
												actions={<FriendshipActions user={person} className="w-full" />}
											/>
										))}
								</ul>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
