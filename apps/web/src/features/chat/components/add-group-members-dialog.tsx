import type { UserDTO } from "@chatty/shared-types";
import { Search, X } from "lucide-react";
import { useCallback, useState } from "react";
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
	onClose: () => void;
}

/** Search, multi-select, then confirm — the same shape `NewConversationPanel` uses to start a chat. */
export function AddGroupMembersDialog({ conversationId, participantIds, onClose }: AddGroupMembersDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);
	const { query, setQuery, results, isSearching, error: searchError, search } = useUserSearch(participantIds);
	const [selectedUsers, setSelectedUsers] = useState<UserDTO[]>([]);
	const [isAdding, setIsAdding] = useState(false);
	const [addError, setAddError] = useState("");

	function toggleUser(user: UserDTO) {
		setSelectedUsers((current) =>
			current.some((selected) => selected.id === user.id)
				? current.filter((selected) => selected.id !== user.id)
				: [...current, user],
		);
	}

	async function handleAdd() {
		if (selectedUsers.length === 0) return;

		setIsAdding(true);
		setAddError("");
		try {
			for (const user of selectedUsers) await api.addParticipant(conversationId, user.id);
			onClose();
		} catch (addingError) {
			setAddError((addingError as Error).message);
		} finally {
			setIsAdding(false);
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
								className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
							/>
						</div>
					</form>

					<SelectedParticipants
						participants={selectedUsers}
						onRemove={(userId) =>
							setSelectedUsers((current) => current.filter((user) => user.id !== userId))
						}
					/>
					{selectedUsers.length === 0 && <p className="eyebrow mt-3 text-ink-faint">No one selected yet</p>}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
					{isSearching && <p className="eyebrow py-2 text-ink-faint">Searching…</p>}
					{(searchError || addError) && (
						<p role="alert" className="eyebrow py-2 text-signal">
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
						disabled={isAdding || selectedUsers.length === 0}
						className="w-full"
					>
						Add people
					</Button>
				</div>
			</div>
		</div>
	);
}
