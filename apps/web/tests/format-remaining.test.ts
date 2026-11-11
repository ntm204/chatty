import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRemaining } from "@/features/chat/thread/utils/format-remaining";

const NOW = new Date("2026-08-23T14:30:00Z");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("formatRemaining", () => {
	it("has nothing to count down to without a deadline", () => {
		expect(formatRemaining(null)).toBeNull();
	});

	it("returns null once the deadline has passed", () => {
		// The actions are gone at this point; a countdown reading "0m left" beside
		// controls that no longer exist is worse than no countdown.
		expect(formatRemaining("2026-08-23T14:29:59Z")).toBeNull();
		expect(formatRemaining("2000-01-01T00:00:00Z")).toBeNull();
	});

	it("counts hours and minutes while there are hours left", () => {
		expect(formatRemaining("2026-08-23T19:42:00Z")).toBe("5h 12m left");
	});

	it("drops to minutes inside the last hour", () => {
		expect(formatRemaining("2026-08-23T14:44:00Z")).toBe("14m left");
	});

	it("does not round the last minute down to nothing", () => {
		expect(formatRemaining("2026-08-23T14:30:30Z")).toBe("under a minute left");
	});
});
