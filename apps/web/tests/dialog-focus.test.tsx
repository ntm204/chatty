import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";

interface TestDialogProps {
	onClose: () => void;
	areControlsDisabled?: boolean;
	label?: string;
}

it("returns to the composer when the opening message was removed", async () => {
	const view = render(
		<>
			<main>
				<textarea aria-label="Message" />
			</main>
			<Button>Message action</Button>
		</>,
	);
	screen.getByRole("button", { name: "Message action" }).focus();
	view.rerender(
		<>
			<main>
				<textarea aria-label="Message" />
			</main>
			<TestDialog onClose={vi.fn()} />
		</>,
	);
	view.rerender(
		<main>
			<textarea aria-label="Message" />
		</main>,
	);
	await waitFor(() => expect(screen.getByLabelText("Message")).toHaveFocus());
});

it("keeps focus on rerender and uses the latest close callback", () => {
	const original = vi.fn();
	const latest = vi.fn();
	const view = render(<TestDialog onClose={original} />);
	const last = screen.getByRole("button", { name: "Last action" });
	last.focus();
	view.rerender(<TestDialog onClose={latest} />);
	expect(last).toHaveFocus();
	fireEvent.keyDown(last, { key: "Escape" });
	expect(original).not.toHaveBeenCalled();
	expect(latest).toHaveBeenCalledOnce();
});

it("leaves composition Escape to the input method", () => {
	const onClose = vi.fn();
	render(<TestDialog onClose={onClose} />);
	fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", isComposing: true });
	fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", keyCode: 229 });
	expect(onClose).not.toHaveBeenCalled();
});

it("restores the original opener after callback changes and skips inaccessible controls", async () => {
	const user = userEvent.setup();
	const view = render(
		<>
			<Button>Open viewer</Button>
		</>,
	);
	const opener = screen.getByRole("button", { name: "Open viewer" });
	opener.focus();
	view.rerender(
		<>
			<Button>Open viewer</Button>
			<TestDialog onClose={vi.fn()} />
		</>,
	);
	const hiddenControl = document.createElement("button");
	hiddenControl.setAttribute("aria-hidden", "true");
	screen.getByRole("dialog").append(hiddenControl);
	screen.getByRole("button", { name: "Last action" }).focus();
	await user.tab();
	expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
	view.rerender(
		<>
			<Button>Open viewer</Button>
			<TestDialog onClose={vi.fn()} />
		</>,
	);
	view.rerender(
		<>
			<Button>Open viewer</Button>
		</>,
	);
	expect(opener).toHaveFocus();
});

function TestDialog({ onClose, areControlsDisabled = false, label = "Example dialog" }: TestDialogProps) {
	const ref = useDialog<HTMLDivElement>(onClose);

	return (
		<div role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
			<Button disabled={areControlsDisabled}>First action</Button>
			<Button disabled={areControlsDisabled}>Last action</Button>
		</div>
	);
}

it("retains keyboard focus when an asynchronous action disables every control", async () => {
	const user = userEvent.setup();
	const onClose = vi.fn();
	const { rerender } = render(<TestDialog onClose={onClose} />);
	const dialog = screen.getByRole("dialog");
	await user.tab();
	expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
	rerender(<TestDialog onClose={onClose} areControlsDisabled />);
	await user.tab();
	expect(dialog).toHaveFocus();
	await user.tab({ shift: true });
	expect(dialog).toHaveFocus();
});

it("recovers escaped focus in either tab direction and wraps at both boundaries", async () => {
	const user = userEvent.setup();
	render(
		<>
			<Button>Background action</Button>
			<TestDialog onClose={vi.fn()} />
		</>,
	);
	const background = screen.getByRole("button", { name: "Background action" });
	const first = screen.getByRole("button", { name: "First action" });
	const last = screen.getByRole("button", { name: "Last action" });
	background.focus();
	await user.tab();
	expect(first).toHaveFocus();
	await user.tab({ shift: true });
	expect(last).toHaveFocus();
	await user.tab();
	expect(first).toHaveFocus();
	background.focus();
	await user.tab({ shift: true });
	expect(last).toHaveFocus();
});

it("only traps keyboard focus in the topmost modal", async () => {
	const user = userEvent.setup();
	render(
		<>
			<TestDialog onClose={vi.fn()} label="First dialog" />
			<TestDialog onClose={vi.fn()} label="Top dialog" areControlsDisabled />
		</>,
	);
	screen.getByRole("dialog", { name: "First dialog" }).focus();
	await user.tab();
	expect(screen.getByRole("dialog", { name: "Top dialog" })).toHaveFocus();
	await user.tab({ shift: true });
	expect(screen.getByRole("dialog", { name: "Top dialog" })).toHaveFocus();
});
