import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDocumentTitle } from "@/features/chat/utils";
import { useDocumentTitle } from "@/features/chat/hooks/use-document-title";
import { makeConversation } from "./factories";

afterEach(() => {
	document.title = "";
	vi.useRealTimers();
});

describe("buildDocumentTitle", () => {
	it("is just the app name when nothing is waiting", () => {
		expect(buildDocumentTitle(0)).toBe("Chatty");
	});

	it("puts the count first, where a truncated tab still shows it", () => {
		expect(buildDocumentTitle(3)).toBe("(3) Chatty");
	});

	it("caps the count rather than printing four digits into a narrow tab", () => {
		expect(buildDocumentTitle(99)).toBe("(99) Chatty");
		expect(buildDocumentTitle(100)).toBe("(99+) Chatty");
	});

	// The sum comes from the same per-conversation counts the badges render, and
	// a negative one would mean those disagreed. Treated as nothing rather than
	// printed, because "(-1)" in a tab title helps nobody.
	it("treats an impossible count as nothing waiting", () => {
		expect(buildDocumentTitle(-1)).toBe("Chatty");
	});

	it("excludes conversations that are currently muted", () => {
		renderHook(() =>
			useDocumentTitle([
				makeConversation({ unreadCount: 4, mutedUntil: "9999-12-31T23:59:59.999Z" }),
				makeConversation({ id: "audible", unreadCount: 2 }),
			]),
		);

		expect(document.title).toBe("(2) Chatty");
	});

	it("restores unread totals at successive mute deadlines without a new message", () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-09-17T08:00:00Z");
		const conversations = [
			makeConversation({ unreadCount: 4, mutedUntil: "2026-09-17T08:00:01Z" }),
			makeConversation({ id: "later", unreadCount: 2, mutedUntil: "2026-09-17T08:00:02Z" }),
		];
		const { unmount } = renderHook(() => useDocumentTitle(conversations));
		expect(document.title).toBe("Chatty");
		act(() => vi.advanceTimersByTime(1000));
		expect(document.title).toBe("(4) Chatty");
		act(() => vi.advanceTimersByTime(1000));
		expect(document.title).toBe("(6) Chatty");
		unmount();
		expect(vi.getTimerCount()).toBe(0);
		expect(document.title).toBe("Chatty");
	});
});
