import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { getSearchSnippet } from "@/features/chat/utils/search-snippet";
import { SearchResultSnippet } from "@/features/chat/components/search-result-snippet";

it("finds Vietnamese accents and decomposed marks without changing original spelling", () => {
	const content = "Đường Đa\u0300 Nẵng";
	const parts = getSearchSnippet(content, "da nang");
	expect(parts.filter((part) => part.isMatch).map((part) => part.text)).toEqual(["Đa\u0300 Nẵng"]);
	expect(parts.map((part) => part.text).join("")).toBe(content);
});
it("centers a bounded preview on a match far into a long message", () => {
	const parts = getSearchSnippet(`${"prefix ".repeat(150)}needle${" suffix".repeat(150)}`, "needle");
	expect(parts.find((part) => part.isMatch)?.text).toBe("needle");
	expect(parts.map((part) => part.text).join("").length).toBeLessThanOrEqual(242);
});
it("renders markup as text and treats regex metacharacters literally", () => {
	render(<SearchResultSnippet content="<script> a+b <img src=x>" query="a+b" />);
	expect(screen.getByText("a+b").tagName).toBe("MARK");
	expect(document.querySelector("script, img")).toBeNull();
});
it("does not split an emoji at the snippet boundary and handles an empty query", () => {
	const text = `${"x".repeat(239)}😀 more`;
	expect(
		getSearchSnippet(text, "")
			.map((part) => part.text)
			.join(""),
	).toBe(`${"x".repeat(239)}😀…`);
});
