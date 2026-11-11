import { describe, expect, it } from "vitest";
import { getAttachmentDisplaySize } from "@/features/chat/media/utils";

describe("getAttachmentDisplaySize", () => {
	it("scales a wide image down to the width cap", () => {
		expect(getAttachmentDisplaySize(1600, 800)).toEqual({ width: 380, height: 190 });
	});

	it("scales a tall image down to the height cap instead", () => {
		// 800x1600 hitting the width cap alone would be 380x760 — well over twice as tall as
		// the bubble allows, which is what pushes its own caption off screen.
		expect(getAttachmentDisplaySize(800, 1600)).toEqual({ width: 230, height: 460 });
	});

	it("leaves a small image alone rather than blowing it up", () => {
		expect(getAttachmentDisplaySize(40, 40)).toEqual({ width: 40, height: 40 });
	});

	it("keeps the aspect ratio", () => {
		const size = getAttachmentDisplaySize(1200, 900);

		expect(size.width / size.height).toBeCloseTo(1200 / 900, 2);
	});

	it("does not divide by zero on a malformed size", () => {
		// Should never arrive, and would render as NaN on the img element if it did.
		const size = getAttachmentDisplaySize(0, 0);

		expect(Number.isFinite(size.width)).toBe(true);
		expect(Number.isFinite(size.height)).toBe(true);
	});
});
