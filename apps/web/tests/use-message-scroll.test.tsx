import type { MessageDTO } from "@chatty/shared-types";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessageScroll } from "@/features/chat/hooks/use-message-scroll";
import { makeMessage, makeSystemMessage } from "./factories";

type ScrollOptions = Parameters<typeof useMessageScroll>[0];

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderScroller(initialMessages: MessageDTO[], overrides: Partial<ScrollOptions> = {}) {
	const container = document.createElement("div");
	const content = document.createElement("div");
	container.append(content);
	const geometry = { scrollHeight: 1200, clientHeight: 400, scrollTop: 0 };
	Object.defineProperties(container, {
		scrollHeight: { get: () => geometry.scrollHeight },
		clientHeight: { get: () => geometry.clientHeight },
		scrollTop: {
			configurable: true,
			get: () => geometry.scrollTop,
			set: (value: number) => {
				geometry.scrollTop = Math.max(0, Math.min(value, geometry.scrollHeight - geometry.clientHeight));
			},
		},
	});
	container.scrollTo = vi.fn();
	let options: ScrollOptions = {
		conversationId: "conversation-1",
		currentUserId: "me",
		messages: initialMessages,
		isViewingHistory: false,
		hasMoreOlder: false,
		isLoadingOlder: false,
		onLoadOlder: vi.fn(),
		...overrides,
	};
	const view = renderHook(
		(props: ScrollOptions) => {
			const scroll = useMessageScroll(props);
			Object.assign(scroll.containerRef, { current: container });
			Object.assign(scroll.contentRef, { current: content });

			return scroll;
		},
		{ initialProps: options },
	);

	return {
		...view,
		container,
		content,
		geometry,
		update(messages: MessageDTO[], updates: Partial<ScrollOptions> = {}) {
			options = { ...options, ...updates, messages };
			view.rerender(options);
		},
		scrollTo(top: number) {
			act(() => {
				container.scrollTop = top;
				view.result.current.handleScroll();
			});
		},
	};
}

describe("useMessageScroll new arrivals", () => {
	it("does not count the initial page or arrivals while following the latest messages", () => {
		const first = makeMessage("first", "peer", "Already here");
		const next = makeMessage("next", "peer", "Just arrived");
		const view = renderScroller([first]);
		expect(view.result.current.newMessageCount).toBe(0);
		expect(view.geometry.scrollTop).toBe(800);
		view.geometry.scrollHeight = 1400;
		view.update([first, next]);

		expect(view.result.current.newMessageCount).toBe(0);
		expect(view.geometry.scrollTop).toBe(1000);
		expect(view.result.current.isPinnedToLatestRef.current).toBe(true);
	});

	it("counts incoming user messages without moving a reader who is above the latest", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.geometry.scrollHeight = 1800;
		view.update([
			first,
			makeMessage("incoming", "peer", "New reply"),
			makeMessage("own", "me", "My message"),
			makeSystemMessage("system", "A member joined"),
			makeMessage("deleted", "peer", "", [], { deletedAt: "2026-09-05T12:00:00.000Z" }),
			makeMessage("incoming-two", "another-peer", "Another reply"),
		]);

		expect(view.result.current.newMessageCount).toBe(2);
		expect(view.result.current.isFarFromBottom).toBe(true);
		expect(view.geometry.scrollTop).toBe(250);
	});

	it("preserves the anchor when older messages are prepended and does not count them", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.geometry.scrollHeight = 1600;
		view.update([makeMessage("older", "peer", "Older history"), first]);

		expect(view.result.current.newMessageCount).toBe(0);
		expect(view.geometry.scrollTop).toBe(650);
	});

	it("does not recount overlapping batches, edits, reactions or replayed ids", () => {
		const first = makeMessage("first", "peer", "Already here");
		const incoming = makeMessage("incoming", "peer", "New reply");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, incoming]);
		view.update([
			{ ...first, content: "Edited", editedAt: "2026-09-05T12:00:00.000Z" },
			{ ...incoming, reactions: [{ emoji: "👍", userIds: ["me"] }] },
			makeMessage("second", "peer", "Second reply"),
		]);
		expect(view.result.current.newMessageCount).toBe(2);
		view.update([first, incoming, makeMessage("second", "peer", "Second reply")]);
		expect(view.result.current.newMessageCount).toBe(2);
		view.update([first]);
		expect(view.result.current.newMessageCount).toBe(0);
		view.update([first, incoming]);

		expect(view.result.current.newMessageCount).toBe(0);
	});

	it("removes a counted arrival when it is deleted or hidden", () => {
		const first = makeMessage("first", "peer", "Already here");
		const incoming = makeMessage("incoming", "peer", "New reply");
		const hidden = makeMessage("hidden", "peer", "Hidden later");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, incoming, hidden]);
		expect(view.result.current.newMessageCount).toBe(2);
		view.update([first, { ...incoming, content: "", deletedAt: "2026-09-05T12:00:00.000Z" }, hidden]);
		expect(view.result.current.newMessageCount).toBe(1);
		view.update([first, { ...incoming, content: "", deletedAt: "2026-09-05T12:00:00.000Z" }]);

		expect(view.result.current.newMessageCount).toBe(0);
	});

	it("still finds an incoming append when an own draft is replaced in the same batch", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first, makeMessage("draft", "me", "Sending")]);
		view.scrollTo(250);
		view.update([first, makeMessage("stored", "me", "Sending"), makeMessage("incoming", "peer", "New reply")]);

		expect(view.result.current.newMessageCount).toBe(1);
	});

	it("resets only on reaching the latest area, then starts a fresh count on the next scroll away", () => {
		const first = makeMessage("first", "peer", "Already here");
		const incoming = makeMessage("incoming", "peer", "New reply");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, incoming]);
		act(() => view.result.current.scrollToLatest());
		expect(view.result.current.newMessageCount).toBe(1);
		expect(view.container.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "smooth" });
		view.scrollTo(720);
		expect(view.result.current.newMessageCount).toBe(0);
		view.scrollTo(250);
		view.update([first, incoming, makeMessage("second", "peer", "Another reply")]);

		expect(view.result.current.newMessageCount).toBe(1);
	});

	it("clears the count for a conversation switch and treats its loaded page as a baseline", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, makeMessage("incoming", "peer", "New reply")]);
		expect(view.result.current.newMessageCount).toBe(1);
		view.update([makeMessage("other-thread", "peer", "Other conversation")], {
			conversationId: "conversation-2",
		});

		expect(view.result.current.newMessageCount).toBe(0);
		expect(view.geometry.scrollTop).toBe(800);
	});

	it("clears on historical navigation and does not count newer history pages", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, makeMessage("incoming", "peer", "New reply")]);
		expect(view.result.current.newMessageCount).toBe(1);
		const historical = makeMessage("historical", "peer", "Search result");
		view.update([historical], { isViewingHistory: true });
		expect(view.result.current.newMessageCount).toBe(0);
		view.update([historical, makeMessage("next-history-page", "peer", "Loaded later")]);
		expect(view.result.current.newMessageCount).toBe(0);
		view.update([first], { isViewingHistory: false });
		expect(view.geometry.scrollTop).toBe(800);
		view.scrollTo(250);
		view.update([first, makeMessage("live-again", "peer", "Live reply")]);

		expect(view.result.current.newMessageCount).toBe(1);
	});

	it("does not call a replacement window with no overlap newly appended messages", () => {
		const view = renderScroller([makeMessage("first", "peer", "Already here")]);
		view.scrollTo(250);
		view.update([makeMessage("different-window", "peer", "Loaded snapshot")]);

		expect(view.result.current.newMessageCount).toBe(0);
	});
});

function observeResizes() {
	const callbacks = new Set<() => void>();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private callback: () => void) {
				callbacks.add(callback);
			}
			observe() {}
			disconnect() {
				callbacks.delete(this.callback);
			}
		},
	);
	return () => act(() => callbacks.forEach((callback) => callback()));
}

describe("useMessageScroll jumping to latest", () => {
	it("keeps smooth-scroll intent across intermediate scrolls, arrivals and resizing", () => {
		const resize = observeResizes();
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, makeMessage("incoming", "peer", "New reply")]);
		act(() => view.result.current.scrollToLatest());
		view.scrollTo(400);
		expect(view.result.current.isJumpingToLatest).toBe(true);
		expect(view.result.current.isPinnedToLatestRef.current).toBe(false);
		view.geometry.scrollHeight = 1400;
		view.update([first, makeMessage("incoming", "peer", "New reply"), makeMessage("second", "peer", "Another")]);

		expect(view.geometry.scrollTop).toBe(400);
		expect(view.result.current.newMessageCount).toBe(2);
		expect(view.container.scrollTo).toHaveBeenLastCalledWith({ top: 1400, behavior: "smooth" });
		view.geometry.clientHeight = 350;
		resize();
		expect(view.geometry.scrollTop).toBe(400);
		expect(view.container.scrollTo).toHaveBeenCalledTimes(3);
		// An observer notification with no new destination must not restart motion.
		resize();
		act(() => view.result.current.scrollToLatest());
		expect(view.container.scrollTo).toHaveBeenCalledTimes(3);
		view.scrollTo(1050);
		expect(view.result.current.isJumpingToLatest).toBe(false);
		expect(view.result.current.isPinnedToLatestRef.current).toBe(true);
		expect(view.result.current.newMessageCount).toBe(0);
	});

	it("does not snap or trim while the last part of a smooth jump is still moving", () => {
		const resize = observeResizes();
		const view = renderScroller([makeMessage("first", "peer", "Already here")]);
		view.scrollTo(250);
		act(() => view.result.current.scrollToLatest());
		view.scrollTo(720);
		expect(view.result.current.isFarFromBottom).toBe(false);
		expect(view.result.current.isJumpingToLatest).toBe(true);
		expect(view.result.current.isPinnedToLatestRef.current).toBe(false);

		view.geometry.scrollHeight = 1300;
		resize();

		expect(view.geometry.scrollTop).toBe(720);
		expect(view.container.scrollTo).toHaveBeenLastCalledWith({ top: 1300, behavior: "smooth" });
		view.scrollTo(900);
		expect(view.result.current.isPinnedToLatestRef.current).toBe(true);
	});

	it.each([
		["wheel", () => new WheelEvent("wheel", { deltaY: -100 })],
		["touch movement", () => new Event("touchmove")],
		["Page Up", () => new KeyboardEvent("keydown", { key: "PageUp", bubbles: true })],
		["Home", () => new KeyboardEvent("keydown", { key: "Home", bubbles: true })],
	])("lets %s cancel a jump and keeps later arrivals from pulling the reader back", (_name, makeEvent) => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, makeMessage("incoming", "peer", "New reply")]);
		act(() => view.result.current.scrollToLatest());
		view.scrollTo(400);

		act(() => view.container.dispatchEvent(makeEvent()));

		expect(view.result.current.isJumpingToLatest).toBe(false);
		expect(view.container.scrollTo).toHaveBeenLastCalledWith({ top: 400, behavior: "auto" });
		view.geometry.scrollHeight = 1400;
		view.update([first, makeMessage("incoming", "peer", "New reply"), makeMessage("second", "peer", "Another")]);
		expect(view.geometry.scrollTop).toBe(400);
		expect(view.result.current.newMessageCount).toBe(2);
	});

	it("does not confuse editing keys, a tap or horizontal wheel motion with deliberate scrolling", () => {
		const view = renderScroller([makeMessage("first", "peer", "Already here")]);
		const editor = document.createElement("textarea");
		view.content.append(editor);
		view.scrollTo(250);
		act(() => view.result.current.scrollToLatest());
		act(() => {
			editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
			view.container.dispatchEvent(new Event("touchstart"));
			view.container.dispatchEvent(new WheelEvent("wheel", { deltaX: 100 }));
			view.container.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		});

		expect(view.result.current.isJumpingToLatest).toBe(true);
		expect(view.container.scrollTo).toHaveBeenCalledOnce();
	});

	it("does not request older pages while a jump passes the pagination threshold", () => {
		const onLoadOlder = vi.fn();
		const view = renderScroller([makeMessage("first", "peer", "Already here")], {
			hasMoreOlder: true,
			onLoadOlder,
		});
		view.scrollTo(0);
		onLoadOlder.mockClear();
		act(() => view.result.current.scrollToLatest());
		view.scrollTo(50);

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("jumps immediately and clears activity when reduced motion is requested", () => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({ matches: true })),
		);
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		view.scrollTo(250);
		view.update([first, makeMessage("incoming", "peer", "New reply")]);
		const scrollTo = vi.fn((options: ScrollToOptions) => {
			view.container.scrollTop = options.top ?? 0;
		});
		Object.defineProperty(view.container, "scrollTo", { value: scrollTo });

		act(() => view.result.current.scrollToLatest());

		expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "auto" });
		expect(view.geometry.scrollTop).toBe(800);
		expect(view.result.current.isJumpingToLatest).toBe(false);
		expect(view.result.current.isFarFromBottom).toBe(false);
		expect(view.result.current.newMessageCount).toBe(0);
	});

	it.each(["conversation switch", "history navigation", "empty conversation"])(
		"cancels an in-flight jump on %s",
		(navigation) => {
			const first = makeMessage("first", "peer", "Already here");
			const view = renderScroller([first]);
			view.scrollTo(250);
			act(() => view.result.current.scrollToLatest());
			view.scrollTo(400);

			if (navigation === "conversation switch")
				view.update([makeMessage("next", "peer", "Other thread")], { conversationId: "other" });
			else if (navigation === "history navigation")
				view.update([makeMessage("old", "peer", "Old result")], { isViewingHistory: true });
			else view.update([]);

			expect(view.result.current.isJumpingToLatest).toBe(false);
			expect(view.container.scrollTo).toHaveBeenLastCalledWith({ top: 400, behavior: "auto" });
			expect(view.result.current.newMessageCount).toBe(0);
		},
	);
});

describe("useMessageScroll reading position", () => {
	it("uses separate reveal and return thresholds to prevent flicker", () => {
		const view = renderScroller([makeMessage("first", "peer", "Already here")]);
		view.scrollTo(680);
		expect(view.result.current.isFarFromBottom).toBe(false);
		view.scrollTo(675);
		expect(view.result.current.isFarFromBottom).toBe(true);
		view.scrollTo(685);
		expect(view.result.current.isFarFromBottom).toBe(true);
		view.scrollTo(710);
		expect(view.result.current.isFarFromBottom).toBe(true);
		view.scrollTo(720);
		expect(view.result.current.isFarFromBottom).toBe(false);
		view.scrollTo(700);
		expect(view.result.current.isFarFromBottom).toBe(false);
	});

	it("preserves the visible message when history and a live arrival land in the same render", () => {
		const first = makeMessage("first", "peer", "Already here");
		const view = renderScroller([first]);
		const row = document.createElement("div");
		row.id = "message-first";
		view.content.append(row);
		let rowOffset = 400;
		vi.spyOn(view.container, "getBoundingClientRect").mockImplementation(
			() => ({ top: 50, bottom: 450 }) as DOMRect,
		);
		vi.spyOn(row, "getBoundingClientRect").mockImplementation(
			() =>
				({
					top: 50 + rowOffset - view.geometry.scrollTop,
					bottom: 150 + rowOffset - view.geometry.scrollTop,
				}) as DOMRect,
		);
		view.scrollTo(250);
		rowOffset += 400;
		view.geometry.scrollHeight += 600;

		view.update([
			makeMessage("older", "peer", "Earlier history"),
			first,
			makeMessage("incoming", "peer", "New arrival"),
		]);

		expect(view.geometry.scrollTop).toBe(650);
		expect(row.getBoundingClientRect().top).toBe(200);
		expect(view.result.current.newMessageCount).toBe(1);
	});

	it("preserves the anchor when an edit above the viewport changes height", () => {
		const above = makeMessage("above", "peer", "Earlier message");
		const first = makeMessage("first", "peer", "Reading here");
		const view = renderScroller([above, first]);
		const row = document.createElement("div");
		row.id = "message-first";
		view.content.append(row);
		let rowOffset = 400;
		vi.spyOn(view.container, "getBoundingClientRect").mockImplementation(
			() => ({ top: 50, bottom: 450 }) as DOMRect,
		);
		vi.spyOn(row, "getBoundingClientRect").mockImplementation(
			() =>
				({
					top: 50 + rowOffset - view.geometry.scrollTop,
					bottom: 150 + rowOffset - view.geometry.scrollTop,
				}) as DOMRect,
		);
		view.scrollTo(250);
		rowOffset += 100;
		view.geometry.scrollHeight += 100;

		view.update([{ ...above, content: "A longer edit that takes up more space" }, first]);

		expect(view.geometry.scrollTop).toBe(350);
		expect(row.getBoundingClientRect().top).toBe(200);
		expect(view.result.current.newMessageCount).toBe(0);
	});

	it("leaves native scrolling alone when an append or resize does not move the anchor", () => {
		const resize = observeResizes();
		const first = makeMessage("first", "peer", "Reading here");
		const view = renderScroller([first]);
		const row = document.createElement("div");
		row.id = "message-first";
		view.content.append(row);
		vi.spyOn(view.container, "getBoundingClientRect").mockImplementation(
			() => ({ top: 50, bottom: 450 }) as DOMRect,
		);
		vi.spyOn(row, "getBoundingClientRect").mockImplementation(
			() => ({ top: 450 - view.geometry.scrollTop, bottom: 550 - view.geometry.scrollTop }) as DOMRect,
		);
		view.scrollTo(250);
		const setScrollTop = vi.spyOn(view.container, "scrollTop", "set");
		view.geometry.scrollHeight += 100;

		view.update([first, makeMessage("incoming", "peer", "New arrival")]);
		resize();

		expect(setScrollTop).not.toHaveBeenCalled();
		expect(view.geometry.scrollTop).toBe(250);
	});

	it("preserves a visible row when late media above it changes height", () => {
		const resize = observeResizes();
		const view = renderScroller([makeMessage("first", "peer", "Already here")]);
		const row = document.createElement("div");
		row.id = "message-first";
		view.content.append(row);
		let rowOffset = 400;
		vi.spyOn(view.container, "getBoundingClientRect").mockImplementation(
			() => ({ top: 50, bottom: 450 }) as DOMRect,
		);
		vi.spyOn(row, "getBoundingClientRect").mockImplementation(
			() =>
				({
					top: 50 + rowOffset - view.geometry.scrollTop,
					bottom: 150 + rowOffset - view.geometry.scrollTop,
				}) as DOMRect,
		);
		view.scrollTo(250);
		rowOffset += 200;
		view.geometry.scrollHeight += 200;

		resize();

		expect(view.geometry.scrollTop).toBe(450);
		expect(row.getBoundingClientRect().top).toBe(200);
		expect(view.result.current.isFarFromBottom).toBe(true);
	});
});
