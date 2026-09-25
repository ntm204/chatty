import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActions } from "@/features/chat/components/message-actions";

afterEach(() => {
	vi.useRealTimers();
});

describe("MessageActions", () => {
	it("removes author-only actions the moment their deadline passes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-29T08:00:00.000Z"));
		render(
			<MessageActions
				onEdit={vi.fn()}
				onToggleReaction={vi.fn()}
				onDeleteForEveryone={vi.fn()}
				onDeleteForMe={vi.fn()}
				myReaction={null}
				authorActionExpiresAt="2026-08-29T08:00:01.000Z"
				align="end"
			/>,
		);
		fireEvent.click(screen.getByLabelText("Message actions"));
		expect(screen.getByRole("menuitem", { name: "Edit message" })).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(1_000));

		expect(screen.queryByRole("menuitem", { name: "Edit message" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("supports arrow navigation and returns focus on Escape", () => {
		render(
			<MessageActions
				onEdit={vi.fn()}
				onToggleReaction={vi.fn()}
				onDeleteForEveryone={vi.fn()}
				onDeleteForMe={vi.fn()}
				myReaction={null}
				authorActionExpiresAt="2099-08-29T08:00:00.000Z"
				align="end"
			/>,
		);
		const trigger = screen.getByLabelText("Message actions");
		fireEvent.click(trigger);
		trigger.focus();
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(screen.getByRole("menuitem", { name: "Edit message" })).toHaveFocus();
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toHaveFocus();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("leaves outside focus and IME alone, and closes the nested picker before its menu", () => {
		render(
			<>
				<input aria-label="Outside" />
				<MessageActions
					onDeleteForMe={vi.fn()}
					onToggleReaction={vi.fn()}
					myReaction={null}
					authorActionExpiresAt={null}
					align="end"
				/>
			</>,
		);
		const trigger = screen.getByRole("button", { name: "React to message" });
		fireEvent.click(trigger);
		const outside = screen.getByLabelText("Outside");
		outside.focus();
		expect(fireEvent.keyDown(outside, { key: "ArrowDown" })).toBe(true);
		expect(outside).toHaveFocus();
		trigger.focus();
		fireEvent.keyDown(trigger, { key: "Escape", isComposing: true });
		expect(screen.getByRole("menu")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Choose another emoji" }));
		const picker = screen.getByRole("dialog", { name: "Choose an emoji" });
		const input = picker.querySelector("input")!;
		input.focus();
		expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Choose another emoji" })).toHaveFocus();
		fireEvent.keyDown(document.activeElement!, { key: "Escape" });
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});
});
