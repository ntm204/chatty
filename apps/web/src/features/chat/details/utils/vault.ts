const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export function formatVaultDate(isoTimestamp: string): string {
	return DATE_FORMATTER.format(new Date(isoTimestamp));
}

export function formatLinkSource(url: string): string {
	const parsed = new URL(url);

	return parsed.hostname || parsed.protocol.replace(":", "");
}

/**
 * Splits a loaded page into the months it was sent in, newest first.
 *
 * Generic over the row rather than written for attachments, because every list
 * in the vault answers "when was this shared?" and a month heading is the only
 * thing that turns a hundred rows into somewhere you can aim. The list arrives
 * already ordered newest-first, so insertion order *is* the order — which is why
 * this is a Map and not a sort.
 *
 * It groups what has been loaded, not what exists. A month heading can therefore
 * gain rows as the next page arrives, which is correct: the alternative is
 * asking the server to count every month before showing the first one.
 */
export function groupVaultByMonth<Item>(items: Item[], timestampOf: (item: Item) => string): [string, Item[]][] {
	const groups = new Map<string, Item[]>();
	for (const item of items) {
		const month = MONTH_FORMATTER.format(new Date(timestampOf(item)));
		groups.set(month, [...(groups.get(month) ?? []), item]);
	}

	return [...groups];
}

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
