import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/features/chat/hooks/use-keyboard-shortcuts";

function options() {
	return {
		hasOpenPanel: false,
		onClosePanel: vi.fn(),
		hasReply: false,
		onCancelReply: vi.fn(),
		isEditing: false,
		onCancelEdit: vi.fn(),
		onEditLast: vi.fn(),
		onOpenConversationSearch: vi.fn(),
		onShowHelp: vi.fn(),
	};
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("useKeyboardShortcuts", () => {
	it("does not open help from nested editable content", () => {
		const callbacks = options();
		const editor = document.createElement("div");
		editor.setAttribute("contenteditable", "true");
		const text = document.createElement("span");
		editor.append(text);
		document.body.append(editor);
		renderHook(() => useKeyboardShortcuts(callbacks));
		fireEvent.keyDown(text, { key: "?" });
		expect(callbacks.onShowHelp).not.toHaveBeenCalled();
	});
	it("focuses global search and opens conversation search", () => {
		const callbacks = options();
		const search = document.createElement("input");
		search.id = "global-conversation-search";
		document.body.append(search);
		renderHook(() => useKeyboardShortcuts(callbacks));

		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(search).toHaveFocus();
		fireEvent.keyDown(document, { key: "f", metaKey: true });
		expect(callbacks.onOpenConversationSearch).toHaveBeenCalledOnce();
	});

	it("edits the last message only from an empty composer", () => {
		const callbacks = options();
		const composer = document.createElement("textarea");
		composer.setAttribute("aria-label", "Message");
		document.body.append(composer);
		renderHook(() => useKeyboardShortcuts(callbacks));

		fireEvent.keyDown(composer, { key: "ArrowUp" });
		expect(callbacks.onEditLast).toHaveBeenCalledOnce();
		composer.value = "draft";
		fireEvent.keyDown(composer, { key: "ArrowUp" });
		expect(callbacks.onEditLast).toHaveBeenCalledOnce();
		composer.value = "";
		fireEvent.keyDown(composer, { key: "ArrowUp", isComposing: true });
		expect(callbacks.onEditLast).toHaveBeenCalledOnce();
	});

	it("uses Escape for the highest-priority open state and exposes help with question mark", () => {
		const callbacks = { ...options(), hasOpenPanel: true, hasReply: true, isEditing: true };
		renderHook(() => useKeyboardShortcuts(callbacks));

		fireEvent.keyDown(document, { key: "Escape" });
		expect(callbacks.onClosePanel).toHaveBeenCalledOnce();
		expect(callbacks.onCancelReply).not.toHaveBeenCalled();
		expect(callbacks.onCancelEdit).not.toHaveBeenCalled();
		fireEvent.keyDown(document.body, { key: "?" });
		expect(callbacks.onShowHelp).toHaveBeenCalledOnce();
	});
});
