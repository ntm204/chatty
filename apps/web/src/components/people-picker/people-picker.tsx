import type { UserDTO } from "@chatty/shared-types";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface PeoplePickerProps {
	people: UserDTO[];
	selectedIds: ReadonlySet<string>;
	onToggle: (userId: string, isSelected: boolean) => void;
	/** Names the list for screen readers and the switches: "An in close friends". */
	listName: string;
	emptyText: string;
}

/**
 * Instagram's close-friends list: a search field, then everyone as a row with
 * their face, name and handle, and a round check on the right. A tap applies at
 * once; selected people are listed first so the current list reads at a glance.
 */
export function PeoplePicker({ people, selectedIds, onToggle, listName, emptyText }: PeoplePickerProps) {
	const [query, setQuery] = useState("");
	const words = query.trim().toLowerCase();
	const matches = people
		.filter(
			(person) =>
				!words ||
				person.displayName.toLowerCase().includes(words) ||
				person.handle.toLowerCase().includes(words),
		)
		.sort((left, right) => Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id)));

	return (
		<div className="flex min-h-0 flex-col gap-2">
			<label className="flex items-center gap-2 rounded-control bg-paper-sunken px-3 py-2">
				<Search aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search"
					aria-label={`Search ${listName}`}
					maxLength={100}
					className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
				/>
			</label>
			{people.length === 0 || matches.length === 0 ? (
				<p className="px-1 py-6 text-center text-sm text-ink-faint">
					{people.length === 0 ? emptyText : "No one matches."}
				</p>
			) : (
				<ul className="flex flex-col" aria-label={listName}>
					{matches.map((person) => {
						const isSelected = selectedIds.has(person.id);

						return (
							<li key={person.id}>
								<Button
									variant="ghost"
									role="switch"
									aria-checked={isSelected}
									aria-label={`${person.displayName} in ${listName}`}
									onClick={() => onToggle(person.id, !isSelected)}
									className="h-auto w-full justify-start gap-3 rounded-control px-2 py-2 text-left font-normal"
								>
									<Avatar user={person} size="md" />
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-sm font-medium text-ink">
											{person.displayName}
										</span>
										<span className="meta truncate text-ink-faint">@{person.handle}</span>
									</span>
									<span
										aria-hidden="true"
										className={cn(
											"flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
											isSelected ? "border-ink bg-ink text-paper" : "border-rule-hover",
										)}
									>
										{isSelected && <Check className="size-3.5" strokeWidth={3} />}
									</span>
								</Button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
