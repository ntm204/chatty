import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "@/features/chat/utils/relative-time";

const NOW = new Date("2026-08-23T14:30:00");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
	return new Date(NOW.getTime() - ms).toISOString();
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("formatRelativeTime", () => {
	it("counts minutes inside the first hour", () => {
		expect(formatRelativeTime(ago(30_000))).toBe("now");
		expect(formatRelativeTime(ago(5 * MINUTE))).toBe("5m");
	});

	it("counts hours inside the first day, never a clock time", () => {
		expect(formatRelativeTime(ago(10 * HOUR))).toBe("10h");
		expect(formatRelativeTime(ago(23 * HOUR))).toBe("23h");
	});

	it("counts days inside the first week", () => {
		expect(formatRelativeTime(ago(DAY))).toBe("1d");
		expect(formatRelativeTime(ago(6 * DAY))).toBe("6d");
	});

	it("counts weeks inside the first year", () => {
		expect(formatRelativeTime(ago(7 * DAY))).toBe("1w");
		expect(formatRelativeTime(ago(14 * DAY))).toBe("2w");
	});

	it("falls back to years once a year has passed", () => {
		expect(formatRelativeTime(ago(400 * DAY))).toBe("1y");
	});
});
