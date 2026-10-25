import type { UserDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";

/**
 * The account-level home for people the user has restricted.
 *
 * Mirrors `BlockedUsersSettings` — same cursor-paged list, same reason it has
 * to live in account settings rather than only beside a conversation: a
 * restriction is invisible to the other person, and a conversation that has
 * gone quiet is not somewhere anyone would think to look to undo it.
 */
export function RestrictedUsersSettings() {
	const unrestrict = useRestrictedUsers((state) => state.unrestrict);
	const [users, setUsers] = useState<UserDTO[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	// A failed first load is not an empty list; saying "none" there would be a guess.
	const [hasLoaded, setHasLoaded] = useState(false);
	const [unrestrictingUserId, setUnrestrictingUserId] = useState<string | null>(null);

	const loadPage = useCallback(async (before?: string, shouldReplace = false) => {
		if (shouldReplace) setIsLoading(true);
		else setIsLoadingMore(true);
		setError("");
		try {
			const page = await api.listRestrictedUsers(before);
			setUsers((current) => (shouldReplace ? page.items : [...current, ...page.items]));
			setNextCursor(page.nextCursor);
			setHasLoaded(true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load restricted people");
		} finally {
			setIsLoading(false);
			setIsLoadingMore(false);
		}
	}, []);

	useEffect(() => {
		void loadPage(undefined, true);
	}, [loadPage]);

	async function handleUnrestrict(userId: string): Promise<void> {
		setUnrestrictingUserId(userId);
		setError("");
		try {
			await unrestrict(userId);
			// A cursor names a restriction row, which may be the row just deleted.
			// Reset rather than continuing from a stale cursor so no later page can 404.
			await loadPage(undefined, true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not stop restricting user");
		} finally {
			setUnrestrictingUserId(null);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[13px] leading-normal text-ink-soft">
				Direct messages stay silent. Your online status and read receipts stay hidden.
			</p>

			{isLoading ? (
				<p className="text-[13px] text-ink-faint">Loading restricted people…</p>
			) : !hasLoaded ? (
				<div className="flex flex-col items-start gap-2">
					<p role="alert" className="text-[13px] text-signal">
						{error || "Could not load restricted people."}
					</p>
					<Button variant="outline" onClick={() => void loadPage(undefined, true)} className="px-4">
						Try again
					</Button>
				</div>
			) : users.length === 0 ? (
				<p className="text-[13px] text-ink-faint">You have not restricted anyone.</p>
			) : (
				<ul className="divide-y divide-rule rounded-panel border border-rule">
					{users.map((user) => (
						<li key={user.id} className="flex items-center gap-3 px-3 py-3">
							<Avatar user={user} size="sm" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-[14px] font-semibold text-ink">{user.displayName}</p>
								<p className="meta truncate text-ink-faint">@{user.handle}</p>
							</div>
							<Button
								variant="outline"
								disabled={unrestrictingUserId !== null}
								onClick={() => void handleUnrestrict(user.id)}
								className="shrink-0 px-3 py-1.5"
							>
								{unrestrictingUserId === user.id ? "Removing…" : "Stop restricting"}
							</Button>
						</li>
					))}
				</ul>
			)}

			{hasLoaded && error && (
				<p role="alert" className="text-[13px] text-signal">
					{error}
				</p>
			)}

			{nextCursor && (
				<Button
					variant="outline"
					disabled={isLoadingMore || unrestrictingUserId !== null}
					onClick={() => void loadPage(nextCursor)}
					className="self-start px-4"
				>
					{isLoadingMore ? "Loading…" : "Load more"}
				</Button>
			)}
		</div>
	);
}
