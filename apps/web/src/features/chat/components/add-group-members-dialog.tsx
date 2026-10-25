import type { UserDTO } from "@chatty/shared-types";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { useUserSearch } from "../hooks";
import { SelectedParticipants } from "./selected-participants";

interface AddGroupMembersDialogProps {
	conversationId: string;
	participantIds: string[];
	canInvite?: boolean;
	onClose: () => void;
}

/** Search, multi-select, then confirm — the same shape `NewConversationPanel` uses to start a chat. */
export function AddGroupMembersDialog({
	conversationId,
	participantIds,
	canInvite = true,
	onClose,
}: AddGroupMembersDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);
	const {
		query,
		setQuery,
		results,
		isSearching,
		hasNoResults,
		error: searchError,
		search,
	} = useUserSearch(participantIds);
	const [selectedUsers, setSelectedUsers] = useState<UserDTO[]>([]);
	const [isAdding, setIsAdding] = useState(false);
	const [addError, setAddError] = useState("");
	const pendingRef = useRef<object | null>(null);
	const permissionRef = useRef(canInvite);
	permissionRef.current = canInvite;
	const participantIdsRef = useRef(participantIds);
	participantIdsRef.current = participantIds;
	useEffect(() => {
		setSelectedUsers((current) => current.filter((user) => !participantIds.includes(user.id)));
	}, [participantIds]);
	useEffect(() => {
		pendingRef.current = null;
		setIsAdding(false);
		setSelectedUsers([]);

		return () => {
			pendingRef.current = null;
		};
	}, [conversationId]);

	function toggleUser(user: UserDTO) {
		if (pendingRef.current) return;
		setSelectedUsers((current) =>
			current.some((selected) => selected.id === user.id)
				? current.filter((selected) => selected.id !== user.id)
				: [...current, user],
		);
	}

	async function handleAdd() {
		if (!permissionRef.current || selectedUsers.length === 0 || pendingRef.current) return;
		const request = {};
		pendingRef.current = request;

		setIsAdding(true);
		setAddError("");
		try {
			for (const user of selectedUsers) {
				if (pendingRef.current !== request) return;
				if (!permissionRef.current) return;
				if (participantIdsRef.current.includes(user.id)) continue;
				await api.addParticipant(conversationId, user.id);
				if (pendingRef.current !== request) return;
				// A partial failure must retry only the people not yet added.
				setSelectedUsers((current) => current.filter((selected) => selected.id !== user.id));
			}
			if (permissionRef.current) onClose();
		} catch (addingError) {
			if (pendingRef.current === request) setAddError((addingError as Error).message);
		} finally {
			if (pendingRef.current === request) {
				pendingRef.current = null;
				setIsAdding(false);
			}
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Add people"
				tabIndex={-1}
				className="flex h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Add people</h2>
					<Button
						variant="ghost"
						aria-label="Close add people"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="shrink-0 px-4 pt-4">
					<form onSubmit={search}>
						<div className="flex h-10 items-center gap-2.5 rounded-full bg-paper-sunken px-3 transition-shadow focus-within:ring-2 focus-within:ring-ink/10">
							<Search className="size-[15px] shrink-0 text-ink-faint" />
							<input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Name, @handle or email"
								aria-label="Search for someone to add"
								className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
							/>
						</div>
					</form>

					<SelectedParticipants
						participants={selectedUsers}
						onRemove={(userId) =>
							!pendingRef.current &&
							setSelectedUsers((current) => current.filter((user) => user.id !== userId))
						}
					/>
					{selectedUsers.length === 0 && <p className="note mt-3 text-ink-faint">No one selected yet</p>}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
					{!canInvite && (
						<p role="alert" className="py-2 text-sm text-signal">
							Your permission to add people changed. Your remaining selections are kept; ask an admin for
							access.
						</p>
					)}
					{isSearching && <p className="note py-2 text-ink-faint">Searching…</p>}
					{hasNoResults && (
						<p role="status" className="py-2 text-sm text-ink-soft">
							No people found. Try another name or handle.
						</p>
					)}
					{(searchError || addError) && (
						<p role="alert" className="note py-2 text-signal">
							{searchError || addError}
						</p>
					)}

					{results.length > 0 && (
						<>
							<h3 className="eyebrow px-2 py-2 text-ink-faint">Results</h3>
							<ul className="flex flex-col gap-0.5">
								{results.map((user) => {
									const isSelected = selectedUsers.some((selected) => selected.id === user.id);

									return (
										<li key={user.id}>
											<Button
												variant="ghost"
												onClick={() => toggleUser(user)}
												aria-pressed={isSelected}
												aria-label={`${user.displayName} @${user.handle}`}
												className="w-full items-center justify-start gap-2.5 px-2 py-2 font-normal"
											>
												<Avatar user={user} size="sm" />
												<span className="flex min-w-0 flex-1 flex-col">
													<span className="w-full truncate text-left text-[13px] font-medium text-ink">
														{user.displayName}
													</span>
													<span className="meta w-full truncate text-left text-ink-faint">
														@{user.handle}
													</span>
												</span>
												<span
													aria-hidden="true"
													className={cn(
														"size-5 shrink-0 rounded-full border-2",
														isSelected ? "border-ink bg-ink" : "border-rule",
													)}
												/>
											</Button>
										</li>
									);
								})}
							</ul>
						</>
					)}
				</div>

				<div className="shrink-0 border-t border-rule p-3">
					<Button
						onClick={() => void handleAdd()}
						disabled={!canInvite || isAdding || selectedUsers.length === 0}
						className="w-full"
					>
						Add people
					</Button>
				</div>
			</div>
		</div>
	);
}
