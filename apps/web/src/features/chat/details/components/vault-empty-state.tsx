import { EMPTY_VAULT_TAB_COPY, VAULT_TAB_ICONS, type VaultTab } from "../constants/vault";

interface VaultEmptyStateProps {
	tab: Exclude<VaultTab, "members">;
}

/**
 * What a tab shows before anyone has shared anything into it.
 *
 * Its own file rather than four lines inside `VaultTabContent`, because the
 * icon lookup and the copy lookup are keyed by the same tab and belong next to
 * each other — and because the content component already carries five list
 * layouts and a lightbox.
 *
 * The mark is a ring rather than a filled shape: this is an absence, and a
 * solid block in the middle of an empty column draws more attention than the
 * thing it is reporting deserves.
 */
export function VaultEmptyState({ tab }: VaultEmptyStateProps) {
	const Icon = VAULT_TAB_ICONS[tab];

	return (
		<div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
			<span
				aria-hidden="true"
				className="flex size-12 items-center justify-center rounded-full border border-rule text-ink-faint"
			>
				<Icon className="size-5" />
			</span>
			<p className="max-w-[240px] text-[13px] leading-relaxed text-ink-faint">{EMPTY_VAULT_TAB_COPY[tab]}</p>
		</div>
	);
}
