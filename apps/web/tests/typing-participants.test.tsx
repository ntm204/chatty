import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTypingParticipants } from "@/features/chat/hooks/use-typing-participants";
import { TYPING_EXPIRY_MS } from "@/features/chat/constants/typing";
import { makeMessage } from "./factories";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock("@/lib/socket", () => ({
	getSocket: () => ({
		on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
		off: (name: string) => listeners.delete(name),
	}),
}));

function emit(name: string, event?: unknown) {
	act(() => listeners.get(name)?.(event));
}
function type(userId: string, conversationId = "one", isTyping = true) {
	emit("typing:update", { userId, conversationId, isTyping });
}
beforeEach(() => {
	vi.useFakeTimers();
	listeners.clear();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("deduplicates refreshes, scopes threads and expires a lost stop event", () => {
	const view = renderHook((id: string) => useTypingParticipants(id), { initialProps: "one" });
	type("an");
	type("an");
	type("binh", "two");
	expect(view.result.current.activeUserIds).toEqual(["an"]);
	view.rerender("two");
	expect(view.result.current.activeUserIds).toEqual(["binh"]);
	act(() => vi.advanceTimersByTime(TYPING_EXPIRY_MS));
	expect(view.result.current.typingByConversation).toEqual({});
});

it("removes only the sender when a message arrives, then clears offline peers", () => {
	const view = renderHook(() => useTypingParticipants("one"));
	type("an");
	type("binh");
	emit("message:new", { ...makeMessage("new", "an", "Sent"), conversationId: "one" });
	expect(view.result.current.activeUserIds).toEqual(["binh"]);
	emit("presence:update", { userId: "binh", isOnline: false, lastSeenAt: null });
	expect(view.result.current.activeUserIds).toEqual([]);
});

it("clears stop events and disconnects, and releases timers on unmount", () => {
	const view = renderHook(() => useTypingParticipants("one"));
	type("an");
	type("an", "one", false);
	expect(view.result.current.activeUserIds).toEqual([]);
	type("an");
	type("binh", "two");
	emit("disconnect");
	expect(view.result.current.typingByConversation).toEqual({});
	expect(vi.getTimerCount()).toBe(0);
	type("an");
	view.unmount();
	expect(vi.getTimerCount()).toBe(0);
	expect(listeners.size).toBe(0);
});
