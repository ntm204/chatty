import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmojiPicker } from "@/features/chat/components/emoji-picker";
import { RECENT_EMOJI_STORAGE_KEY } from "@/features/chat/constants/recent-emoji";

it("closes only its own layer on Escape, not during composition", () => {
	const close = vi.fn();
	const parentKey = vi.fn();
	render(
		<div onKeyDown={parentKey}>
			<EmojiPicker onPick={vi.fn()} onClose={close} anchor="absolute" />
		</div>,
	);
	const field = screen.getByLabelText("Search emoji");
	fireEvent.keyDown(field, { key: "Escape", isComposing: true });
	expect(close).not.toHaveBeenCalled();
	parentKey.mockClear();
	fireEvent.keyDown(field, { key: "Escape" });
	expect(close).toHaveBeenCalledOnce();
	expect(parentKey).not.toHaveBeenCalled();
});

it("searches accented Vietnamese without losing the search field", () => {
	render(<EmojiPicker onPick={vi.fn()} onClose={vi.fn()} anchor="absolute" />);
	fireEvent.change(screen.getByLabelText("Search emoji"), { target: { value: "cười" } });
	expect(screen.getByRole("button", { name: "Insert 😂" })).toBeVisible();
	fireEvent.change(screen.getByLabelText("Search emoji"), { target: { value: "nothing-matches-this" } });
	expect(screen.getByText(/Nothing matches/)).toBeVisible();
});

it("keeps recent targets in place until the picker is reopened", () => {
	localStorage.setItem(RECENT_EMOJI_STORAGE_KEY, JSON.stringify(["❤️", "😂"]));
	const onPick = vi.fn();
	const view = render(<EmojiPicker onPick={onPick} onClose={vi.fn()} anchor="absolute" />);
	fireEvent.click(screen.getAllByRole("button", { name: "Insert 😂" })[0]!);
	expect(
		screen
			.getAllByRole("button", { name: /^Insert / })
			.slice(0, 2)
			.map((button) => button.textContent),
	).toEqual(["❤️", "😂"]);
	expect(onPick).toHaveBeenCalledWith("😂");
	view.unmount();
	localStorage.removeItem(RECENT_EMOJI_STORAGE_KEY);
});
