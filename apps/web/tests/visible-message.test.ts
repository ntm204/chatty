import { afterEach, expect, it, vi } from "vitest";
import { findVisibleMessageId } from "@/features/chat/utils/visible-message";
import { makeMessage } from "./factories";

function bounds(top: number, height: number, width = 400): DOMRect {
	return { top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top, toJSON: () => ({}) };
}

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

it("reads the visible row instead of the newest loaded message and ignores clipped slivers", () => {
	const container = document.createElement("div");
	document.body.append(container);
	vi.spyOn(container, "getBoundingClientRect").mockReturnValue(bounds(100, 300));
	const messages = [makeMessage("older", "peer", "old"), makeMessage("newer", "peer", "new")];
	for (const message of messages) {
		const row = document.createElement("div");
		row.id = `message-${message.id}`;
		container.append(row);
		vi.spyOn(row, "getBoundingClientRect").mockReturnValue(bounds(message.id === "older" ? 150 : 390, 80));
	}
	expect(findVisibleMessageId(container, messages)).toBe("older");
	vi.mocked(container.lastElementChild!.getBoundingClientRect).mockReturnValue(bounds(300, 80));
	expect(findVisibleMessageId(container, messages)).toBe("newer");
	vi.mocked(container.getBoundingClientRect).mockReturnValue(bounds(0, 0, 0));
	expect(findVisibleMessageId(container, messages)).toBeUndefined();
});

it("never submits local draft ids as read markers", () => {
	const container = document.createElement("div");
	document.body.append(container);
	vi.spyOn(container, "getBoundingClientRect").mockReturnValue(bounds(0, 300));
	const row = document.createElement("div");
	row.id = "message-draft:local";
	container.append(row);
	vi.spyOn(row, "getBoundingClientRect").mockReturnValue(bounds(50, 80));
	expect(findVisibleMessageId(container, [makeMessage("draft:local", "me", "not stored")])).toBeUndefined();
});
