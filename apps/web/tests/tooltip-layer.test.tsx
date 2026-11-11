import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipLayer } from "@/components/tooltip-layer";
import { TOOLTIP_DELAY_MS } from "@/constants/tooltip";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function hover(element: Element, pointerType = "mouse") {
	fireEvent.pointerOver(element, { pointerType });
}

it("names an icon-only button after a short hover, and never one with its own words", () => {
	vi.useFakeTimers();
	render(
		<>
			<TooltipLayer />
			<button type="button" aria-label="Search messages">
				<svg />
			</button>
			<button type="button" aria-label="Send now">
				Send
			</button>
		</>,
	);
	const iconButton = screen.getByRole("button", { name: "Search messages" });
	hover(iconButton);
	expect(screen.queryByText("Search messages", { selector: ".tooltip-bubble" })).toBeNull();
	act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
	expect(screen.getByText("Search messages", { selector: ".tooltip-bubble" })).toHaveAttribute("aria-hidden", "true");

	fireEvent.pointerDown(iconButton);
	expect(document.querySelector(".tooltip-bubble")).toBeNull();

	hover(screen.getByRole("button", { name: "Send now" }));
	act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
	expect(document.querySelector(".tooltip-bubble")).toBeNull();
});

it("shows nothing for touch", () => {
	vi.useFakeTimers();
	render(
		<>
			<TooltipLayer />
			<button type="button" aria-label="Attach">
				<svg />
			</button>
		</>,
	);
	hover(screen.getByRole("button", { name: "Attach" }), "touch");
	act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
	expect(document.querySelector(".tooltip-bubble")).toBeNull();
});
