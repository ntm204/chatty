import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificationTabCoordinator } from "@/features/chat/utils/notification-tab-coordinator";

beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal("BroadcastChannel", undefined);
	Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete (navigator as { locks?: unknown }).locks;
});

describe("notification tab coordinator", () => {
	it("allows only one hidden tab for the same account to create a popup without Web Locks", async () => {
		const firstTab = createNotificationTabCoordinator("minh");
		const secondTab = createNotificationTabCoordinator("minh");
		const createPopup = vi.fn(() => "popup");

		const [firstResult, secondResult] = await Promise.all([
			firstTab.runOnce("message-1", createPopup),
			secondTab.runOnce("message-1", createPopup),
		]);

		expect(createPopup).toHaveBeenCalledTimes(1);
		expect([firstResult, secondResult]).toContain("popup");
		expect([firstResult, secondResult]).toContain(null);
		firstTab.dispose();
		secondTab.dispose();
	});

	it("keeps notification receipts isolated by signed-in account", async () => {
		const minhTab = createNotificationTabCoordinator("minh");
		const linhTab = createNotificationTabCoordinator("linh");
		const createPopup = vi.fn(() => "popup");

		await Promise.all([minhTab.runOnce("message-1", createPopup), linhTab.runOnce("message-1", createPopup)]);

		expect(createPopup).toHaveBeenCalledTimes(2);
		minhTab.dispose();
		linhTab.dispose();
	});
});
