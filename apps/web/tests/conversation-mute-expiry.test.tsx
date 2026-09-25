import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationActions } from "@/features/chat/components/conversation-actions";
import { ConversationQuickActions } from "@/features/chat/components/conversation-quick-actions";
import { useConversationMuted } from "@/features/chat/hooks/use-conversation-muted";
import { makeConversation } from "./factories";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime("2026-09-17T08:00:00Z");
});

afterEach(() => vi.useRealTimers());

describe("mute deadline", () => {
	it("updates the sidebar badge and details action without a new conversation response", () => {
		const conversation = makeConversation({ mutedUntil: "2026-09-17T08:00:01Z" });
		render(
			<>
				<ConversationActions conversation={conversation} currentUserId="minh" />
				<ConversationQuickActions conversation={conversation} onOpenSearch={() => undefined} />
			</>,
		);
		expect(screen.getByRole("img", { name: "Muted" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Turn notifications back on" })).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(1000));
		expect(screen.queryByRole("img", { name: "Muted" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Mute notifications" })).toBeInTheDocument();
	});

	it("refreshes a deadline that passed while browser timers were suspended", () => {
		const { result } = renderHook(() => useConversationMuted("2026-09-17T08:15:00Z"));
		vi.setSystemTime("2026-09-17T08:16:00Z");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(result.current).toBe(false);
	});

	it("replaces the deadline and removes listeners and timers on unmount", () => {
		const { result, rerender, unmount } = renderHook(({ until }) => useConversationMuted(until), {
			initialProps: { until: "2026-09-17T08:00:01Z" },
		});
		rerender({ until: "2026-09-17T08:00:02Z" });
		act(() => vi.advanceTimersByTime(1000));
		expect(result.current).toBe(true);
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps a permanent mute without overflowing the timer into a repeated immediate refresh", () => {
		const { result } = renderHook(() => useConversationMuted("9999-12-31T23:59:59.999Z"));
		act(() => vi.advanceTimersByTime(1000));
		expect(result.current).toBe(true);
		expect(vi.getTimerCount()).toBe(1);
	});
});
