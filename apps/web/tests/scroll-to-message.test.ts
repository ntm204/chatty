import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_LOCATION_DURATION_MS } from "@/features/chat/constants/message-navigation";
import { clearMessageLocation, scrollToMessage } from "@/features/chat/utils/scroll-to-message";

function createHistory() {
	const pane = document.createElement("div");
	pane.className = "conversation-pane";
	const container = document.createElement("div");
	container.setAttribute("aria-label", "Message history");
	Object.defineProperties(container, {
		clientHeight: { value: 400 },
		scrollHeight: { value: 1200 },
	});
	container.scrollTop = 100;
	container.scrollTo = vi.fn();
	vi.spyOn(container, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 50, 800, 400));
	for (const id of ["first", "second"]) {
		const message = document.createElement("div");
		message.id = `message-${id}`;
		vi.spyOn(message, "getBoundingClientRect").mockReturnValue(new DOMRect(50, 350, 180, 40));
		container.append(message);
	}
	pane.append(container);
	document.body.append(pane);

	return {
		pane,
		container,
		first: container.children[0] as HTMLElement,
		second: container.children[1] as HTMLElement,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false })),
	);
});

afterEach(() => {
	for (const container of document.querySelectorAll<HTMLElement>('[aria-label="Message history"]')) {
		clearMessageLocation(container);
	}
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("message location cue", () => {
	it("scrolls only the message viewport and clears its temporary cue", () => {
		const { container, first } = createHistory();
		expect(scrollToMessage("first")).toBe(true);
		expect(container.scrollTo).toHaveBeenCalledWith({ top: 220, behavior: "smooth" });
		expect(first).toHaveAttribute("data-message-located", "true");
		expect(first.className).toBe("");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS);
		expect(first).not.toHaveAttribute("data-message-located");
	});

	it("renews the full cue lifetime when the same message is selected again", () => {
		const { first } = createHistory();
		scrollToMessage("first");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS - 100);
		scrollToMessage("first");
		vi.advanceTimersByTime(100);
		expect(first).toHaveAttribute("data-message-located", "true");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS - 101);
		expect(first).toHaveAttribute("data-message-located", "true");
		vi.advanceTimersByTime(1);
		expect(first).not.toHaveAttribute("data-message-located");
	});

	it("moves the cue to the new target without an older timer clearing it", () => {
		const { first, second } = createHistory();
		scrollToMessage("first");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS / 2);
		scrollToMessage("second");
		expect(first).not.toHaveAttribute("data-message-located");
		expect(second).toHaveAttribute("data-message-located", "true");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS / 2);
		expect(second).toHaveAttribute("data-message-located", "true");
		vi.advanceTimersByTime(MESSAGE_LOCATION_DURATION_MS / 2);
		expect(second).not.toHaveAttribute("data-message-located");
	});

	it("keeps a static cue with reduced motion and centers below the floating header", () => {
		const { pane, container, first } = createHistory();
		const chrome = document.createElement("header");
		chrome.className = "conversation-chrome";
		vi.spyOn(chrome, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 50, 800, 100));
		pane.prepend(chrome);
		const animate = vi.fn();
		first.animate = animate;
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({ matches: true })),
		);
		scrollToMessage("first");
		expect(container.scrollTo).toHaveBeenCalledWith({ top: 170, behavior: "auto" });
		expect(first).toHaveAttribute("data-message-located", "true");
		expect(animate).not.toHaveBeenCalled();
	});

	it("finishes a glide that was cut short once scrolling settles", () => {
		const { container } = createHistory();
		scrollToMessage("first");
		// Nothing moved: an anchor correction cancelled the native animation.
		vi.advanceTimersByTime(400);
		expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 220, behavior: "auto" });
		expect(vi.getTimerCount()).toBe(1);
	});

	it("leaves the position to a reader who scrolls during the glide", () => {
		const { container } = createHistory();
		scrollToMessage("first");
		container.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));
		vi.advanceTimersByTime(400);
		expect(container.scrollTo).toHaveBeenCalledTimes(1);
	});

	it("clears the destination cue when navigation is dismissed", () => {
		const { container, first } = createHistory();
		scrollToMessage("first");
		clearMessageLocation(container);
		expect(first).not.toHaveAttribute("data-message-located");
		expect(vi.getTimerCount()).toBe(0);
		expect(scrollToMessage("missing")).toBe(false);
	});
});
