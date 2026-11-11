import { describe, expect, it } from "vitest";
import { easeInOutCubic, paintFlowingGradient } from "@/features/chat/theme/utils/flowing-gradient";

function image(width: number, height: number) {
	return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
}

describe("paintFlowingGradient", () => {
	it("paints every pixel opaque, at any step including a slightly negative one", () => {
		for (const step of [0, 0.5, 7.9, 13, -0.01]) {
			const target = image(6, 8);
			paintFlowingGradient(target, ["#ff0000", "#00ff00", "#0000ff", "#ffffff"], step, 0.6);
			expect(Array.from(target.data.filter((_, index) => index % 4 === 3)).every((alpha) => alpha === 255)).toBe(
				true,
			);
		}
	});

	it("comes back to the same picture after a full turn of the ring", () => {
		const first = image(5, 5);
		const later = image(5, 5);
		const colours: [string, string, string, string] = ["#f6dca6", "#d9c8f6", "#f5c3d6", "#bfe0f4"];
		paintFlowingGradient(first, colours, 1, 0);
		paintFlowingGradient(later, colours, 9, 0);
		expect(Array.from(later.data)).toEqual(Array.from(first.data));
	});
});

describe("easeInOutCubic", () => {
	it("starts at rest and lands at rest", () => {
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(1)).toBe(1);
		expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
	});
});
