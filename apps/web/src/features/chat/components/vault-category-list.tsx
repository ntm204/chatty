import type { ConversationVaultSummaryDTO } from "@chatty/shared-types";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/button";
import { VAULT_TABS, VAULT_TAB_ICONS, type VaultTab } from "../constants/vault";

interface VaultCategoryListProps {
	summary: ConversationVaultSummaryDTO | null;
	memberCount: number | null;
	onSelect: (tab: VaultTab) => void;
}

/** Counts stay absent until loaded, so an unknown total never reads as zero. */
export function VaultCategoryList({ summary, memberCount, onSelect }: VaultCategoryListProps) {
	function countOf(tab: VaultTab): number | null {
		if (tab === "members") return memberCount;

		return summary ? summary[tab] : null;
	}

	return (
		<ul className="flex flex-col">
			{VAULT_TABS.filter((tab) => tab.id !== "members" || memberCount !== null).map((tab) => {
				const Icon = VAULT_TAB_ICONS[tab.id];
				const count = countOf(tab.id);

				return (
					<li key={tab.id}>
						<Button
							variant="ghost"
							onClick={() => onSelect(tab.id)}
							// Spelled out rather than left to be assembled from the label and
							// the count, which sit in adjacent elements with no whitespace
							// between them: a screen reader reads that as "Saved2".
							aria-label={count === null ? tab.label : `${tab.label}, ${count}`}
							className="min-h-12 w-full justify-start gap-3 rounded-panel px-3 py-2.5 text-left font-normal"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
								<Icon className="size-4 text-ink-soft" />
							</span>
							<span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{tab.label}</span>
							{count !== null && <span className="meta shrink-0 text-ink-faint">{count}</span>}
							<ChevronRight className="size-4 shrink-0 text-ink-faint" />
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
