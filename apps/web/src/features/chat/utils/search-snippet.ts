import { foldSearchText } from "./fold-search-text";

interface SearchSnippetPart {
	text: string;
	isMatch: boolean;
}

/** Preserve original spelling while locating an accent-insensitive match, including decomposed Unicode. */
export function getSearchSnippet(content: string, query: string): SearchSnippetPart[] {
	const foldedQuery = foldSearchText(query.trim());
	let folded = "";
	const starts: number[] = [];
	const ends: number[] = [];
	let offset = 0;
	for (const character of content) {
		const normalized = foldSearchText(character);
		for (let index = 0; index < normalized.length; index++) {
			starts.push(offset);
			ends.push(offset + character.length);
		}
		if (!normalized && ends.length) ends[ends.length - 1] = offset + character.length;
		folded += normalized;
		offset += character.length;
	}
	const first = foldedQuery ? folded.indexOf(foldedQuery) : -1;
	const matchStart = first < 0 ? 0 : starts[first]!;
	let start = Math.max(0, matchStart - 70);
	let end = Math.min(content.length, Math.max(start + 240, first < 0 ? 0 : ends[first + foldedQuery.length - 1]!));
	// Do not split a surrogate pair at the preview boundary.
	if (start > 0 && /[\uDC00-\uDFFF]/u.test(content[start]!)) start--;
	if (end < content.length && /[\uDC00-\uDFFF]/u.test(content[end]!)) end++;
	const parts: SearchSnippetPart[] = [];
	if (start) parts.push({ text: "…", isMatch: false });
	let cursor = start;
	let found = first;
	while (found >= 0 && starts[found]! < end) {
		const from = starts[found]!;
		const to = ends[found + foldedQuery.length - 1]!;
		if (from > cursor) parts.push({ text: content.slice(cursor, from), isMatch: false });
		parts.push({ text: content.slice(from, to), isMatch: true });
		cursor = to;
		found = folded.indexOf(foldedQuery, found + foldedQuery.length);
	}
	if (cursor < end) parts.push({ text: content.slice(cursor, end), isMatch: false });
	if (end < content.length) parts.push({ text: "…", isMatch: false });

	return parts;
}
