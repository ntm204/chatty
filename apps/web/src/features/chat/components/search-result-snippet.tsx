import { getSearchSnippet } from "../utils/search-snippet";

interface SearchResultSnippetProps {
	content: string;
	query: string;
}

export function SearchResultSnippet({ content, query }: SearchResultSnippetProps) {
	return (
		<span className="line-clamp-3 w-full whitespace-pre-wrap break-words text-sm text-ink">
			{getSearchSnippet(content, query).map((part, index) =>
				part.isMatch ? (
					<mark key={index} className="rounded-sm bg-signal-soft font-semibold text-ink">
						{part.text}
					</mark>
				) : (
					<span key={index}>{part.text}</span>
				),
			)}
		</span>
	);
}
