import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { KeyboardShortcutsPanel } from "@/features/chat/components/keyboard-shortcuts-panel";

it("focuses, traps and dismisses keyboard help, returning to its opener", async () => {
	const user = userEvent.setup();
	const onClose = vi.fn();
	const { rerender } = render(
		<>
			<input aria-label="Background" />
		</>,
	);
	const opener = screen.getByRole("textbox", { name: "Background" });
	opener.focus();
	rerender(
		<>
			<input aria-label="Background" />
			<KeyboardShortcutsPanel onClose={onClose} />
		</>,
	);
	const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
	expect(dialog).toHaveFocus();
	await user.tab();
	const close = screen.getByRole("button", { name: "Close shortcuts" });
	expect(close).toHaveFocus();
	await user.tab();
	expect(close).toHaveFocus();
	await user.keyboard("{Escape}");
	expect(onClose).toHaveBeenCalledOnce();
	rerender(
		<>
			<input aria-label="Background" />
		</>,
	);
	expect(screen.getByRole("textbox", { name: "Background" })).toHaveFocus();
});
