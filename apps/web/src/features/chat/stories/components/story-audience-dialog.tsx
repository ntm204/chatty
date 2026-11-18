import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { PeoplePicker } from "@/components/people-picker";
import { SegmentedControl } from "@/components/segmented-control";
import { useDialog } from "@/hooks/use-dialog";
import { useStoryPeopleLists } from "@/hooks/use-story-people-lists";
import type { StoryPeopleList } from "@/types/story-people";
import { STORY_PEOPLE_LIST_OPTIONS } from "../constants/story-composer";

interface StoryAudienceDialogProps {
	onClose: () => void;
}

/**
 * Your two private note lists, Instagram's way: pick people from everyone you
 * chat with, each tap saved at once, and Done to leave. Neither list is ever
 * shown to anyone — nobody learns they are a close friend, or hidden.
 */
export function StoryAudienceDialog({ onClose }: StoryAudienceDialogProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const [list, setList] = useState<StoryPeopleList>("close_friends");
	const { settings, selected, toggle, error } = useStoryPeopleLists();

	return (
		<div
			className="backdrop-fade fixed inset-0 z-60 flex items-end justify-center bg-scrim/50 sm:items-center sm:p-4"
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
				className="dialog-enter flex h-[min(600px,92vh)] w-full flex-col overflow-hidden rounded-t-panel bg-paper-raised shadow-modal outline-none sm:max-w-sm sm:rounded-panel"
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-rule px-3 py-2.5">
					<Button variant="ghost" aria-label="Close note audience" onClick={onClose} className="size-9 p-0">
						<X className="size-5" />
					</Button>
					<h2 className="flex-1 text-center text-base font-semibold">Note audience</h2>
					<Button variant="ghost" onClick={onClose} className="h-9 px-3 font-semibold">
						Done
					</Button>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
					<span id="story-people-list" className="sr-only">
						List
					</span>
					<SegmentedControl
						options={STORY_PEOPLE_LIST_OPTIONS}
						value={list}
						onChange={setList}
						labelledBy="story-people-list"
					/>
					<p className="text-[13px] leading-normal text-ink-soft">
						{list === "close_friends"
							? `${selected.close_friends.size} ${selected.close_friends.size === 1 ? "person sees" : "people see"} notes you share with close friends.`
							: `${selected.hidden.size} ${selected.hidden.size === 1 ? "person never sees" : "people never see"} your notes.`}
					</p>
					{settings ? (
						<PeoplePicker
							people={settings.contacts}
							selectedIds={selected[list]}
							onToggle={(userId, isSelected) => toggle(list, userId, isSelected)}
							listName={list === "close_friends" ? "close friends" : "hidden"}
							emptyText="People you chat with appear here."
						/>
					) : (
						!error && <p className="text-sm text-ink-faint">Loading…</p>
					)}
					{error && (
						<p role="alert" className="text-[13px] text-signal">
							{error}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
