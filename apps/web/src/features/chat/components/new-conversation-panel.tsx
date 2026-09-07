import type { UserDTO } from "@chatty/shared-types";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { cn } from "@/utils/cn";
import { useUserSearch } from "../hooks";
import { SelectedParticipants } from "./selected-participants";

interface NewConversationPanelProps {
	onConversationStarted: (conversationId: string) => void;
}

export function NewConversationPanel({ onConversationStarted }: NewConversationPanelProps) {
	const { query, setQuery, results, isSearching, error: searchError, search, reset: resetSearch } = useUserSearch();
	const [selectedUsers, setSelectedUsers] = useState<UserDTO[]>([]);
	const [groupName, setGroupName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState("");

	// One selected person is a direct chat; more than one makes it a group, which
	// is the same rule the server applies when deciding `isGroup`.
	const isGroup = selectedUsers.length > 1;

	function handleToggleUser(user: UserDTO) {
		setSelectedUsers((current) =>
			current.some((selected) => selected.id === user.id)
				? current.filter((selected) => selected.id !== user.id)
				: [...current, user],
		);
	}

	function handleRemoveUser(userId: string) {
		setSelectedUsers((current) => current.filter((selected) => selected.id !== userId));
	}

	async function handleCreate() {
		if (selectedUsers.length === 0) return;

		setIsCreating(true);
		setCreateError("");
		try {
			const participantIds = selectedUsers.map((user) => user.id);
			// The name is only meaningful for a group; the server ignores it for a
			// direct chat, which is titled after the other person per viewer.
			const trimmedName = groupName.trim();
			const conversation = await api.createConversation(
				participantIds,
				isGroup && trimmedName ? trimmedName : undefined,
			);

			resetSearch();
			setSelectedUsers([]);
			setGroupName("");
			onConversationStarted(conversation.id);
		} catch (creationError) {
			setCreateError((creationError as Error).message);
		} finally {
			setIsCreating(false);
		}
	}

	return (
		<div className="px-4 pb-3">
			<form onSubmit={search}>
				<div className="people-search flex h-10 items-center gap-2.5 rounded-full bg-paper-sunken px-3 transition-shadow focus-within:ring-2 focus-within:ring-ink/10">
					<Search className="size-[15px] shrink-0 text-ink-faint" />
					<input
						id="global-conversation-search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search people"
						aria-label="Find someone"
						className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
					/>
				</div>
			</form>

			<SelectedParticipants participants={selectedUsers} onRemove={handleRemoveUser} />

			{isSearching && <p className="eyebrow mt-3 text-ink-faint">Searching…</p>}
			{(searchError || createError) && (
				<p role="alert" className="eyebrow mt-3 text-signal">
					{searchError || createError}
				</p>
			)}

			{results.length > 0 && (
				<ul className="mt-3 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
					{results.map((user) => {
						const isSelected = selectedUsers.some((selected) => selected.id === user.id);

						return (
							<li key={user.id}>
								<Button
									variant="ghost"
									onClick={() => handleToggleUser(user)}
									aria-pressed={isSelected}
									// The handle is what makes two people with the same
									// display name tellable apart, so it is part of the
									// accessible name, not decoration.
									aria-label={`${user.displayName} @${user.handle}`}
									className={cn(
										"w-full items-center justify-start gap-2.5 px-2 py-2 font-normal",
										isSelected && "bg-ink/5 text-ink",
									)}
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
								</Button>
							</li>
						);
					})}
				</ul>
			)}

			{isGroup && (
				<div className="mt-4">
					<TextField
						label="Group name (optional)"
						value={groupName}
						onChange={(event) => setGroupName(event.target.value)}
						placeholder="e.g. Weekend football"
					/>
				</div>
			)}

			{selectedUsers.length > 0 && (
				<Button onClick={() => void handleCreate()} disabled={isCreating} className="mt-4 w-full">
					{isGroup
						? `Create group with ${selectedUsers.length} people`
						: `Chat with ${selectedUsers[0]!.displayName}`}
				</Button>
			)}
		</div>
	);
}
