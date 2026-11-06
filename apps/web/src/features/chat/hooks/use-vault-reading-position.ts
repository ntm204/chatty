import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { VaultTab } from "../constants/vault";

interface ReadingPosition {
	top: number;
	itemId: string | undefined;
	offset: number;
}

interface ReadingItem {
	id: string;
}

export function useVaultReadingPosition(
	containerRef: RefObject<HTMLDivElement>,
	activeTab: VaultTab | null,
	isLoading: boolean,
	items: readonly ReadingItem[],
) {
	const positionsRef = useRef(new Map<VaultTab, ReadingPosition>());
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container || !activeTab || isLoading) return;
		const position = positionsRef.current.get(activeTab);
		const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-vault-item]")).find(
			(item) => item.dataset.vaultItem === position?.itemId,
		);
		if (anchor && position)
			container.scrollTop +=
				anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - position.offset;
		else container.scrollTop = position?.top ?? 0;
	}, [containerRef, activeTab, isLoading, items]);

	return () => {
		const container = containerRef.current;
		// Recorded during a refresh too: a live update reloads the list while the
		// reader keeps scrolling, and ignoring that scroll snapped them back to a
		// stale spot once it finished. Only an emptied list has nothing to anchor.
		if (!container || !activeTab || items.length === 0) return;
		const top = container.getBoundingClientRect().top;
		const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-vault-item]")).find(
			(item) => item.getBoundingClientRect().bottom > top,
		);
		positionsRef.current.set(activeTab, {
			top: container.scrollTop,
			itemId: anchor?.dataset.vaultItem,
			offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
		});
	};
}
