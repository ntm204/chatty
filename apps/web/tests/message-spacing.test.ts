import { describe, expect, it } from "vitest";
import { hasMessageTimeGap, isWithinMessageBurst } from "@/features/chat/thread/utils/message-grouping";

describe("message spacing", () => {
	it("keeps nearby messages in one burst", () => {
		expect(isWithinMessageBurst("2026-08-30T10:04:00.000Z", "2026-08-30T10:00:00.000Z")).toBe(true);
	});

	it("starts a new burst after a quiet spell", () => {
		expect(isWithinMessageBurst("2026-08-30T10:06:00.000Z", "2026-08-30T10:00:00.000Z")).toBe(false);
	});

	it("shows a time marker after an hour without messages", () => {
		expect(hasMessageTimeGap("2026-08-30T11:00:00.000Z", "2026-08-30T10:00:00.000Z")).toBe(true);
	});
});
