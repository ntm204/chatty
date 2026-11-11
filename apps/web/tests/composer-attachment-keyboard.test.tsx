import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ComposerAttachmentMenu } from "@/features/chat/composer/components/composer-attachment-menu";

it("leaves composition and keys outside the attachment menu alone, and consumes its own Escape", async () => {
	const user = userEvent.setup();
	render(
		<>
			<input aria-label="Another input" />
			<ComposerAttachmentMenu
				isDisabled={false}
				isFull={false}
				onOpen={vi.fn()}
				onOpenStickerTray={vi.fn()}
				onFilesSelected={vi.fn()}
				onFileSelected={vi.fn()}
			/>
		</>,
	);
	const trigger = screen.getByRole("button", { name: "Add an attachment" });
	await user.click(trigger);
	const photos = screen.getByRole("menuitem", { name: "Photos" });
	await waitFor(() => expect(photos).toHaveFocus());
	for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
		fireEvent.keyDown(photos, { key: "ArrowDown", ...composition });
		fireEvent.keyDown(photos, { key: "Escape", ...composition });
		expect(photos).toHaveFocus();
		expect(trigger).toHaveAttribute("aria-expanded", "true");
	}
	const outside = screen.getByRole("textbox", { name: "Another input" });
	outside.focus();
	await user.keyboard("{Home}{ArrowDown}{Escape}");
	expect(outside).toHaveFocus();
	expect(trigger).toHaveAttribute("aria-expanded", "true");

	photos.focus();
	const escaped = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
	fireEvent(photos, escaped);
	expect(escaped.defaultPrevented).toBe(true);
	expect(trigger).toHaveAttribute("aria-expanded", "false");
	expect(trigger).toHaveFocus();
});
