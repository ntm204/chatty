import type { UserDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useBlockedUsers } from "@/hooks/use-blocked-users";

/**
 * The account-level home for people the user has blocked.
 *
 * A conversation can be archived or disappear far down the sidebar, so making
 * block controls available only from a chat would turn "unblock" into a hunt.
 * This consumes the cursor API page-by-page; privacy settings must not fetch an
 * account-sized list simply to render the first screen.
 */
export function BlockedUsersSettings() {
	const unblock = useBlockedUsers((state) => state.unblock);
	const [users, setUsers] = useState<UserDTO[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);

	const loadPage = useCallback(async (before?: string, shouldReplace = false) => {
		if (shouldReplace) setIsLoading(true);
		else setIsLoadingMore(true);
		setError("");
		try {
			const page = await api.listBlockedUsers(before);
			setUsers((current) => (shouldReplace ? page.items : [...current, ...page.items]));
			setNextCursor(page.nextCursor);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load blocked users");
		} finally {
			setIsLoading(false);
			setIsLoadingMore(false);
		}
	}, []);

	useEffect(() => {
		void loadPage(undefined, true);
	}, [loadPage]);

	async function handleUnblock(userId: string): Promise<void> {
		setUnblockingUserId(userId);
		setError("");
		try {
			await unblock(userId);
			// A cursor names a block row, which may be the row just deleted. Reset
			// rather than continuing from a stale cursor so no later page can 404.
			await loadPage(undefined, true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not unblock user");
		} finally {
			setUnblockingUserId(null);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[13px] leading-normal text-ink-soft">
				No direct messages or search visibility. Shared groups stay unchanged.
			</p>

			{isLoading ? (
				<p className="text-[13px] text-ink-faint">Loading blocked users…</p>
			) : users.length === 0 ? (
				<p className="text-[13px] text-ink-faint">You have not blocked anyone.</p>
			) : (
				<ul className="divide-y divide-rule rounded-panel border border-rule">
					{users.map((user) => (
						<li key={user.id} className="flex items-center gap-3 px-3 py-3">
							<Avatar user={user} size="sm" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-[13.5px] font-semibold text-ink">{user.displayName}</p>
								<p className="meta truncate text-ink-faint">@{user.handle}</p>
							</div>
							<Button
								variant="outline"
								disabled={unblockingUserId !== null}
								onClick={() => void handleUnblock(user.id)}
								className="shrink-0 px-3 py-1.5"
							>
								{unblockingUserId === user.id ? "Unblocking…" : "Unblock"}
							</Button>
						</li>
					))}
				</ul>
			)}

			{error && (
				<p role="alert" className="text-[13px] text-signal">
					{error}
				</p>
			)}

			{nextCursor && (
				<Button
					variant="outline"
					disabled={isLoadingMore || unblockingUserId !== null}
					onClick={() => void loadPage(nextCursor)}
					className="self-start px-4"
				>
					{isLoadingMore ? "Loading…" : "Load more"}
				</Button>
			)}
		</div>
	);
}
