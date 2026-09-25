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
		if (!container || !activeTab || isLoading) return;
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
