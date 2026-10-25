import type { ReactionDTO, UserDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { groupReactors } from "../utils";

interface ReactionDetailsPanelProps {
	reactions: ReactionDTO[];
	users: UserDTO[];
	currentUserId: string;
	onClose: () => void;
}

/**
 * Who reacted, and with what.
 *
 * The answer used to live in a `title` attribute on each chip, which meant it
 * was a hover away on a desktop and unreachable on every touch screen — on the
 * device most reactions are left from, the app could show you that eleven people
 * had reacted and no way at all to find out who. That is the gap this closes;
 * the tooltip stays, because it is still the cheapest answer when there is one
 * name in it.
 *
 * Tabbed by emoji with an "All" tab in front, which is what Messenger and
 * Telegram both do and for a good reason: in a group the interesting question is
 * usually "who disagreed", and that is one tab rather than a scan down a mixed
 * list. Tabs are ordered by count, unlike the chips under the bubble — nobody is
 * aiming at a tab strip, so it can sort by what is most useful instead of
 * holding still.
 *
 * A reactor who has since left the group is counted but not listed: the id is
 * real, the person is no longer in `participants`, and inventing a row for them
 * would be the client making up a name. The count on the tab comes from the DTO,
 * so the number and the list can disagree — and when they do, that difference is
 * the truth rather than a bug.
 */
export function ReactionDetailsPanel({ reactions, users, currentUserId, onClose }: ReactionDetailsPanelProps) {
	const groups = groupReactors(reactions, users);
	const [activeEmoji, setActiveEmoji] = useState<string | null>(null);
	const titleId = useId();
	const dialogRef = useDialog<HTMLElement>(onClose);

	const total = groups.reduce((sum, group) => sum + group.total, 0);
	const selectedEmoji = groups.some((group) => group.emoji === activeEmoji) ? activeEmoji : null;
	const shown = selectedEmoji ? groups.filter((group) => group.emoji === selectedEmoji) : groups;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4 dark:bg-scrim/55"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="flex h-[min(70vh,32rem)] w-full max-w-sm flex-col overflow-hidden rounded-panel border border-rule bg-paper shadow-modal outline-none"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-5">
					<div className="min-w-0">
						<h2 id={titleId} className="font-display text-[22px] leading-none tracking-tight">
							Reactions
						</h2>
						<p className="meta mt-2 text-ink-faint">
							{total} {total === 1 ? "person" : "people"}
						</p>
					</div>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close reactions"
						className="size-8 shrink-0 border border-rule p-0"
					>
						<X className="size-3.5" />
					</Button>
				</header>

				{/* Only worth a strip when there is something to filter down to. One
				    emoji means the tabs would offer "All" and the only answer. */}
				{groups.length > 1 && (
					<div
						role="tablist"
						aria-label="Filter by reaction"
						onKeyDown={(event) => {
							if (event.isPropagationStopped() || event.nativeEvent.isComposing) return;
							const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
							const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
							const next =
								event.key === "ArrowRight"
									? (index + 1) % tabs.length
									: event.key === "ArrowLeft"
										? (index + tabs.length - 1) % tabs.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? tabs.length - 1
												: -1;
							if (next < 0) return;
							event.preventDefault();
							tabs[next]?.focus();
							tabs[next]?.click();
						}}
						className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-rule-soft px-4 py-2"
					>
						<Button
							variant="ghost"
							role="tab"
							aria-selected={selectedEmoji === null}
							tabIndex={selectedEmoji === null ? 0 : -1}
							onClick={() => setActiveEmoji(null)}
							className={cn(
								"eyebrow shrink-0 rounded-full px-3 py-1.5",
								selectedEmoji === null ? "bg-block text-block-ink hover:bg-block" : "text-ink-soft",
							)}
						>
							All {total}
						</Button>
						{groups.map((group) => (
							<Button
								key={group.emoji}
								variant="ghost"
								role="tab"
								aria-selected={group.emoji === selectedEmoji}
								tabIndex={group.emoji === selectedEmoji ? 0 : -1}
								aria-label={`${group.emoji}, ${group.total}`}
								onClick={() => setActiveEmoji(group.emoji)}
								className={cn(
									"shrink-0 gap-1.5 rounded-full px-3 py-1.5",
									group.emoji === selectedEmoji
										? "bg-block text-block-ink hover:bg-block"
										: "text-ink-soft",
								)}
							>
								<span aria-hidden="true" className="text-[15px] leading-none">
									{group.emoji}
								</span>
								<span className="meta">{group.total}</span>
							</Button>
						))}
					</div>
				)}

				<ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
					{shown.flatMap((group) =>
						group.users.map((user) => (
							<li key={`${group.emoji}-${user.id}`} className="flex items-center gap-3 px-3 py-2">
								<Avatar user={user} size="sm" />
								<div className="min-w-0 flex-1">
									<p title={user.displayName} className="truncate text-[14px] font-medium">
										{user.id === currentUserId ? "You" : user.displayName}
									</p>
									<p className="meta truncate text-ink-faint">@{user.handle}</p>
								</div>
								<span aria-hidden="true" className="text-[17px] leading-none">
									{group.emoji}
								</span>
							</li>
						)),
					)}
				</ul>
			</section>
		</div>
	);
}
