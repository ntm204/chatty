import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";

interface TestDialogProps {
	onClose: () => void;
	areControlsDisabled?: boolean;
	label?: string;
}

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
