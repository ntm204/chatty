import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PinnedMessagesBanner } from "@/features/chat/components/pinned-messages-banner";

const pins = [
	{ messageId: "two", content: "Second pin", pinnedAt: "2026-09-02", pinnedById: "me" },
	{ messageId: "one", content: "First pin", pinnedAt: "2026-09-01", pinnedById: "me" },
];

describe("pinned message navigation", () => {
	it("always jumps to the most recently pinned message until the dialog picks a different one", async () => {
		const user = userEvent.setup();
		const open = vi.fn();
		render(<PinnedMessagesBanner pinnedMessages={pins} currentUserId="me" onOpenMessage={open} />);
		await user.click(screen.getByText("Second pin"));
		expect(open).toHaveBeenLastCalledWith("two");

		await user.click(screen.getByLabelText("Show pinned messages"));
		await user.click(screen.getByRole("button", { name: "First pin" }));
		expect(open).toHaveBeenLastCalledWith("one");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

		// Closing the dialog without picking anything else still targets the latest pin.
		await user.click(screen.getByText("Second pin"));
		expect(open).toHaveBeenLastCalledWith("two");
	});

	it("opens a centered dialog listing every pin, closable with Escape", async () => {
		const user = userEvent.setup();
		render(<PinnedMessagesBanner pinnedMessages={pins} currentUserId="me" onOpenMessage={vi.fn()} />);

		await user.click(screen.getByLabelText("Show pinned messages"));
		expect(screen.getByRole("dialog", { name: "Pinned messages" })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("hides the expand button and dialog with only one pinned message", () => {
		render(<PinnedMessagesBanner pinnedMessages={[pins[0]!]} currentUserId="me" onOpenMessage={vi.fn()} />);
		expect(screen.queryByLabelText("Show pinned messages")).not.toBeInTheDocument();
	});

	it("renders nothing when there are no pinned messages", () => {
		const view = render(<PinnedMessagesBanner pinnedMessages={[]} currentUserId="me" onOpenMessage={vi.fn()} />);
		expect(view.container).toBeEmptyDOMElement();
	});
});
