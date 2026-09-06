import { StrictMode, useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMessageDraft } from "@/features/chat/hooks/use-message-draft";

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
			const clear = useMessageDraft({
				conversationId: id,
				content,
				replyToId: null,
				onRestore: (draft) => setContent(draft.content),
			});

			return { content, setContent, clear };
		},
		{ initialProps: conversationId, wrapper: StrictMode },
	);
}

it("restores an existing draft through StrictMode replay and reopening", () => {
	localStorage.setItem("chatty:draft:one", JSON.stringify({ content: "Nháp tiếng Việt", replyToId: null }));
	const view = openDraft();
	expect(view.result.current.content).toBe("Nháp tiếng Việt");
	view.unmount();
	const reopened = openDraft();
	expect(reopened.result.current.content).toBe("Nháp tiếng Việt");
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
	expect(JSON.parse(localStorage.getItem("chatty:draft:one")!)).toEqual({
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
	expect(localStorage.getItem("chatty:draft:one")).toBeNull();
});

it("ignores malformed storage and keeps the composer usable if storage throws", () => {
	localStorage.setItem("chatty:draft:one", '{"content":42}');
	const view = openDraft();
	expect(view.result.current.content).toBe("");
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("Full");
	});
	act(() => view.result.current.setContent("Still editable"));
	act(() => vi.advanceTimersByTime(300));
	expect(view.result.current.content).toBe("Still editable");
	view.unmount();
});
