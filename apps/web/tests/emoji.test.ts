import { describe, expect, it } from "vitest";
import { countJumboEmoji, searchEmoji } from "@/features/chat/utils";

describe("countJumboEmoji", () => {
	it("counts a single emoji", () => {
		expect(countJumboEmoji("😀")).toBe(1);
	});

	it("counts up to three, spaces and all", () => {
		expect(countJumboEmoji("😀😀")).toBe(2);
		expect(countJumboEmoji("😀 😀 😀")).toBe(3);
	});

	it("refuses a fourth, because that is a sentence rather than a gesture", () => {
		expect(countJumboEmoji("😀😀😀😀")).toBe(0);
	});

	it("refuses anything with words in it", () => {
		expect(countJumboEmoji("ok 😀")).toBe(0);
		expect(countJumboEmoji("😀 nhé")).toBe(0);
	});

	it("refuses an empty message", () => {
		expect(countJumboEmoji("")).toBe(0);
		expect(countJumboEmoji("   ")).toBe(0);
	});

	it("treats a flag as one emoji, not two", () => {
		// Two regional indicators. Counting code points would call this two and
		// silently drop it below the threshold in a message of three flags.
		expect(countJumboEmoji("🇻🇳")).toBe(1);
		expect(countJumboEmoji("🇻🇳🇻🇳🇻🇳")).toBe(3);
	});

	it("treats a heart with its variation selector as one", () => {
		// U+2764 U+FE0F — the exact pair that makes a free-text reaction column
		// undecidable, and the reason the reactions stayed a closed enum.
		expect(countJumboEmoji("❤️")).toBe(1);
	});

	it("treats a joined sequence as one emoji", () => {
		expect(countJumboEmoji("🧑‍💻")).toBe(1);
	});
});

describe("searchEmoji", () => {
	it("matches accented and decomposed Vietnamese and preserves emoji variation selectors", () => {
		expect(searchEmoji("cười")).toEqual(searchEmoji("cuoi"));
		expect(searchEmoji("cười".normalize("NFD"))).toEqual(searchEmoji("cuoi"));
		expect(searchEmoji("❤️").map((entry) => entry.char)).toContain("❤️");
	});
	it("finds by an English keyword", () => {
		expect(searchEmoji("laugh").map((entry) => entry.char)).toContain("😂");
	});

	it("finds by an unaccented Vietnamese keyword", () => {
		// The same reasoning phase 20 applied to message search: unaccented is
		// what actually gets typed.
		expect(searchEmoji("cuoi").map((entry) => entry.char)).toContain("😂");
		expect(searchEmoji("tim").map((entry) => entry.char)).toContain("❤️");
	});

	it("matches inside a keyword, not only at its start", () => {
		expect(searchEmoji("cry").map((entry) => entry.char)).toContain("😭");
	});

	it("returns nothing for an empty query, rather than everything", () => {
		expect(searchEmoji("")).toEqual([]);
		expect(searchEmoji("   ")).toEqual([]);
	});

	it("returns nothing for a query that matches nothing", () => {
		expect(searchEmoji("zzzzz-not-a-thing")).toEqual([]);
	});
});
