interface VaultPage<Item> {
	items: Item[];
	hasMore: boolean;
}

/** Publish a refreshed window only once, so intermediate pages cannot collapse the reader's list. */
export async function loadRetainedVaultPage<Item extends { id: string }>(
	fetchPage: (before?: string) => Promise<VaultPage<Item>>,
	isCurrent: () => boolean,
	retainCount: number,
	before?: string,
) {
	const page = await fetchPage(before);
	if (!isCurrent()) return null;
	while (!before && page.hasMore && page.items.length < retainCount) {
		const cursor = page.items.at(-1)?.id;
		if (!cursor) break;
		const next = await fetchPage(cursor);
		if (!isCurrent()) return null;
		const ids = new Set(page.items.map((item) => item.id));
		const added = next.items.filter((item) => !ids.has(item.id));
		page.items.push(...added);
		page.hasMore = next.hasMore;
		if (!added.length) break;
	}

	return page;
}
