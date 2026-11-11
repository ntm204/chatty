import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDayLabel, isNewDay } from "@/features/chat/thread/utils/format-day";
import { formatMessageTime } from "@/features/chat/utils/format-time";

// "Today" is relative to the clock, so the clock is pinned — otherwise these
// tests would pass all day and fail at midnight.
const NOW = new Date("2026-08-23T14:30:00");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("formatMessageTime", () => {
	it("shows the time and nothing else for a message sent today", () => {
		const formatted = formatMessageTime(new Date("2026-08-23T09:05:00").toISOString());

		expect(formatted).toMatch(/\d{2}:\d{2}/);
		expect(formatted).not.toMatch(/\d{2}\/\d{2}/);
	});

	it("still shows only the time for a message from another day", () => {
		// The date used to be prepended here. It moved to the day rule the list
		// draws above the first message of each day, so printing it again beside
		// every bubble underneath would say the same thing twice.
		const formatted = formatMessageTime(new Date("2026-08-21T09:05:00").toISOString());

		expect(formatted).toMatch(/\d{2}:\d{2}/);
		expect(formatted).not.toMatch(/\d{2}\/\d{2}/);
	});
});

describe("formatDayLabel", () => {
	it("names today and yesterday rather than dating them", () => {
		expect(formatDayLabel(new Date("2026-08-23T00:01:00").toISOString())).toBe("Today");
		expect(formatDayLabel(new Date("2026-08-22T23:59:00").toISOString())).toBe("Yesterday");
	});

	it("dates anything older, and drops the year inside the current one", () => {
		const label = formatDayLabel(new Date("2026-08-01T09:00:00").toISOString());

		expect(label).toMatch(/1/);
		expect(label).not.toMatch(/2026/);
	});

	it("carries the year once the day is in a different one", () => {
		expect(formatDayLabel(new Date("2025-12-31T09:00:00").toISOString())).toMatch(/2025/);
	});
});

describe("isNewDay", () => {
	it("treats the first message of a list as opening a day", () => {
		expect(isNewDay(NOW.toISOString(), undefined)).toBe(true);
	});

	it("keeps two messages from the same day together", () => {
		expect(
			isNewDay(new Date("2026-08-23T23:59:00").toISOString(), new Date("2026-08-23T00:00:00").toISOString()),
		).toBe(false);
	});

	it("splits a run that crosses midnight", () => {
		// One minute apart, two days apart. Comparing elapsed time rather than
		// calendar days would put these under one rule.
		expect(
			isNewDay(new Date("2026-08-23T00:00:00").toISOString(), new Date("2026-08-22T23:59:00").toISOString()),
		).toBe(true);
	});
});
