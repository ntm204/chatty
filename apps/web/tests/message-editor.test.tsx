import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MessageEditor } from "@/features/chat/components/message-editor";

it("does not save on composition Enter or repeated Enter", () => {
	const save = vi.fn();
	render(<MessageEditor initialContent="original" hasAttachment={false} onSave={save} onCancel={vi.fn()} />);
	const editor = screen.getByLabelText("Edit message");
	fireEvent.change(editor, { target: { value: "Đã sửa\nsecond line" } });
	fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
	fireEvent.keyDown(editor, { key: "Enter", keyCode: 229 });
	fireEvent.keyDown(editor, { key: "Enter", repeat: true });
	fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
	expect(save).not.toHaveBeenCalled();
	fireEvent.keyDown(editor, { key: "Enter" });
	expect(save).toHaveBeenCalledWith("Đã sửa\nsecond line");
});

it("keeps the edit after a failed save and blocks repeated submission while pending", async () => {
	let rejectSave!: (error: Error) => void;
	const save = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					rejectSave = reject;
				}),
		)
		.mockResolvedValue(undefined);
	const cancel = vi.fn();
	render(<MessageEditor initialContent="original" hasAttachment={false} onSave={save} onCancel={cancel} />);
	const editor = screen.getByLabelText("Edit message");
	fireEvent.change(editor, { target: { value: "important edit" } });
	fireEvent.keyDown(editor, { key: "Enter" });
	fireEvent.keyDown(editor, { key: "Enter" });
	fireEvent.keyDown(editor, { key: "Escape" });
	expect(save).toHaveBeenCalledTimes(1);
	expect(cancel).not.toHaveBeenCalled();
	expect(editor).toBeDisabled();
	await act(async () => {
		rejectSave(new Error("Edit window expired. Copy your text."));
	});
	expect(editor).toHaveValue("important edit");
	expect(editor).not.toBeDisabled();
	expect(screen.getByRole("alert")).toHaveTextContent("Edit window expired");
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
	});
	expect(save).toHaveBeenCalledTimes(2);
});
