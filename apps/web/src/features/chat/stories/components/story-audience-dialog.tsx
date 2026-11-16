import type { StoryAudienceSettingsDTO } from "@chatty/shared-types";
import { Search, Star, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { Switch } from "@/components/switch";
import { useDialog } from "@/hooks/use-dialog";
import { getErrorMessage } from "@/utils/get-error-message";
import { STORY_PEOPLE_LIST_OPTIONS } from "../constants/story-composer";
import type { StoryPeopleList } from "../types/story-audience";

interface StoryAudienceDialogProps {
	onClose: () => void;
}

/**
 * Your two private story lists, drawn from the people you chat with. Neither is
 * ever shown to anyone: nobody learns they are a close friend, or hidden.
 */
export function StoryAudienceDialog({ onClose }: StoryAudienceDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close, { closeOnEscape: false });
	const [list, setList] = useState<StoryPeopleList>("close_friends");
	const [searchQuery, setSearchQuery] = useState("");
	const [settings, setSettings] = useState<StoryAudienceSettingsDTO | null>(null);
	const [selected, setSelected] = useState<Record<StoryPeopleList, Set<string>>>({
		close_friends: new Set(),
		hidden: new Set(),
	});
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		api.getStoryAudienceSettings()
			.then((loaded) => {
				setSettings(loaded);
				setSelected({ close_friends: new Set(loaded.closeFriendIds), hidden: new Set(loaded.hiddenIds) });
			})
			.catch((loadError: unknown) => setError(getErrorMessage(loadError, "Your lists could not be loaded.")));
	}, []);

	function toggle(userId: string, isOn: boolean) {
		setSelected((current) => {
			const next = new Set(current[list]);
			if (isOn) next.add(userId);
			else next.delete(userId);

			return { ...current, [list]: next };
		});
	}

	async function save() {
		setIsSaving(true);
		setError("");
		try {
			await api.setCloseFriends([...selected.close_friends]);
			await api.setStoryHiddenFrom([...selected.hidden]);
			onClose();
		} catch (saveError) {
			setError(getErrorMessage(saveError, "Your lists could not be saved. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	const filteredContacts = (settings?.contacts ?? []).filter((contact) => {
		const query = searchQuery.toLowerCase().trim();
		if (!query) return true;

		return contact.displayName.toLowerCase().includes(query) || contact.handle.toLowerCase().includes(query);
	});

	const closeFriendsCount = selected.close_friends.size;
	const hiddenCount = selected.hidden.size;

	return (
		<div
			className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4 backdrop-blur-xs"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Note audience"
				tabIndex={-1}
				className="dialog-enter flex max-h-[min(640px,100%)] w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center justify-center border-b border-rule p-4">
					<h2 className="text-base font-semibold">Note audience</h2>
					<Button
						variant="ghost"
						aria-label="Close note audience"
						onClick={onClose}
						className="absolute right-3 top-3 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex flex-col gap-2.5 border-b border-rule-soft p-4">
					<span id="story-people-list" className="sr-only">
						List
					</span>
					<div className="flex items-center justify-between">
						<SegmentedControl
							options={STORY_PEOPLE_LIST_OPTIONS}
							value={list}
							onChange={setList}
							labelledBy="story-people-list"
						/>
						<span className="text-[11px] font-medium text-ink-faint">
							{list === "close_friends" ? `${closeFriendsCount} selected` : `${hiddenCount} hidden`}
						</span>
					</div>

					<p className="note text-ink-faint">
						{list === "close_friends"
							? "Stories for close friends reach only these people with a special badge."
							: "These people never see your stories or notes. They are not told."}
					</p>

					{/* Quick search */}
					<div className="relative flex items-center mt-1">
						<Search className="pointer-events-none absolute left-3 size-3.5 text-ink-faint" />
						<input
							type="text"
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="Search people you chat with…"
							className="h-8 w-full rounded-full border border-rule bg-paper-sunken/60 pr-3 pl-8 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-ink/40"
						/>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{!settings && !error && <p className="note px-2 py-3 text-ink-faint">Loading…</p>}
					{settings?.contacts.length === 0 && (
						<p className="note px-2 py-3 text-ink-faint">Start a chat with someone to add them here.</p>
					)}
					{filteredContacts.map((contact) => {
						const isSelected = selected[list].has(contact.id);

						return (
							<div
								key={contact.id}
								className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-paper-sunken/40"
							>
								<div className="relative shrink-0">
									<Avatar user={contact} size="sm" />
									{list === "close_friends" && isSelected && (
										<span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-signal text-paper shadow-xs">
											<Star className="size-2 fill-current" />
										</span>
									)}
								</div>
								<div className="min-w-0 flex-1">
									<span className="block truncate text-[13px] font-medium text-ink">
										{contact.displayName}
									</span>
									<span className="block truncate text-[11px] text-ink-faint">@{contact.handle}</span>
								</div>
								<Switch
									label={`${contact.displayName} in ${list === "close_friends" ? "close friends" : "hidden"}`}
									isOn={isSelected}
									onChange={(isOn) => toggle(contact.id, isOn)}
								/>
							</div>
						);
					})}
				</div>

				{error && (
					<p role="alert" className="note px-4 pb-2 text-signal">
						{error}
					</p>
				)}

				<div className="border-t border-rule p-4">
					<Button onClick={() => void save()} disabled={!settings || isSaving} className="w-full">
						{isSaving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
