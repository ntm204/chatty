import { StrictMode, useLayoutEffect, useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMessageDraft } from "@/features/chat/hooks/use-message-draft";
import { clearLocalUserData } from "@/lib/local-chat-store";
import { getMessageDraftKey } from "@/lib/message-drafts";

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function openDraft(conversationId = "one") {
	return renderHook(
		(id: string) => {
			const [content, setContent] = useState("");
			const { clearDraft: clear, hasStorageError } = useMessageDraft({
				userId: "minh",
				conversationId: id,
				content,
				replyToId: null,
				onRestore: (draft) => setContent(draft.content),
			});

			return { content, setContent, clear, hasStorageError };
		},
		{ initialProps: conversationId, wrapper: StrictMode },
	);
}

it("restores an existing draft through StrictMode replay and reopening", () => {
	localStorage.setItem("chatty:user-draft:minh:one", JSON.stringify({ content: "Nháp tiếng Việt", replyToId: null }));
	const view = openDraft();
	expect(view.result.current.content).toBe("Nháp tiếng Việt");
	view.unmount();
	const reopened = openDraft();
	expect(reopened.result.current.content).toBe("Nháp tiếng Việt");
});

it("restores before the composer can receive its first browser input", () => {
	const phases: string[] = [];
	renderHook(() => {
		useMessageDraft({
			userId: "minh",
			conversationId: "one",
			content: "",
			replyToId: null,
			onRestore: () => {
				phases.push("restore");
			},
		});
		useLayoutEffect(() => {
			phases.push("interactive");
		}, []);
	});
	expect(phases).toEqual(["restore", "interactive"]);
});

it("keeps separate drafts through rapid conversation switches without remounting", () => {
	const view = openDraft();
	act(() => view.result.current.setContent("Draft A"));
	view.rerender("two");
	expect(view.result.current.content).toBe("");
	act(() => view.result.current.setContent("Draft B"));
	view.rerender("one");
	expect(view.result.current.content).toBe("Draft A");
	view.rerender("two");
	expect(view.result.current.content).toBe("Draft B");
});

it("flushes the latest keystroke on pagehide before the debounce expires", () => {
	const view = openDraft();
	act(() => view.result.current.setContent("Reload immediately"));
	act(() => window.dispatchEvent(new Event("pagehide")));
	expect(JSON.parse(localStorage.getItem("chatty:user-draft:minh:one")!)).toEqual({
		content: "Reload immediately",
		replyToId: null,
	});
});

it("does not resurrect a sent draft from a pending timer or cleanup", () => {
	const view = openDraft();
	act(() => view.result.current.setContent("Send this"));
	act(() => view.result.current.clear());
	act(() => vi.advanceTimersByTime(300));
	view.unmount();
	expect(localStorage.getItem("chatty:user-draft:minh:one")).toBeNull();
});

it("ignores malformed storage and keeps the composer usable if storage throws", () => {
	localStorage.setItem("chatty:user-draft:minh:one", '{"content":42}');
	const view = openDraft();
	expect(view.result.current.content).toBe("");
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("Full");
	});
	act(() => view.result.current.setContent("Still editable"));
	act(() => vi.advanceTimersByTime(300));
	expect(view.result.current.content).toBe("Still editable");
	expect(view.result.current.hasStorageError).toBe(true);
	view.unmount();
});

it("discards legacy drafts instead of assigning them to the next account", () => {
	localStorage.setItem("chatty:draft:one", JSON.stringify({ content: "Someone else's draft", replyToId: null }));
	const view = openDraft();
	expect(view.result.current.content).toBe("");
	expect(localStorage.getItem("chatty:draft:one")).toBeNull();
});

it("does not restore another account's draft for the same conversation", () => {
	const view = renderHook(
		(userId: string) => {
			const [content, setContent] = useState("");
			useMessageDraft({
				userId,
				conversationId: "shared",
				content,
				replyToId: null,
				onRestore: (draft) => setContent(draft.content),
			});
			return { content, setContent };
		},
		{ initialProps: "alice", wrapper: StrictMode },
	);
	act(() => view.result.current.setContent("Alice private"));
	view.rerender("bob");
	expect(view.result.current.content).toBe("");
	act(() => view.result.current.setContent("Bob private"));
	view.rerender("alice");
	expect(view.result.current.content).toBe("Alice private");
	view.rerender("bob");
	expect(view.result.current.content).toBe("Bob private");
});

it("account cleanup defeats a pending timer, pagehide and unmount without deleting another account", async () => {
	const otherKey = getMessageDraftKey("an", "one");
	localStorage.setItem(otherKey, JSON.stringify({ content: "An's draft", replyToId: null }));
	const view = openDraft();
	act(() => view.result.current.setContent("Private pending keystroke"));
	await act(() => clearLocalUserData("minh"));
	act(() => vi.advanceTimersByTime(300));
	act(() => window.dispatchEvent(new Event("pagehide")));
	view.unmount();
	expect(localStorage.getItem(getMessageDraftKey("minh", "one"))).toBeNull();
	expect(localStorage.getItem(otherKey)).toContain("An's draft");
	const reopened = openDraft();
	expect(reopened.result.current.content).toBe("");
});
