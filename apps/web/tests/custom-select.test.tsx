import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CustomSelect } from "@/components/custom-select";

it("supports keyboard selection, Escape and focus restoration without a native select", async () => {
	const user = userEvent.setup();
	const change = vi.fn();
	const view = render(
		<CustomSelect
			label="Invite permission"
			value="all"
			options={[
				{ value: "all", label: "Everyone" },
				{ value: "admins", label: "Admins" },
			]}
			onChange={change}
		/>,
	);
	const trigger = screen.getByRole("button", { name: /Invite permission/ });
	await user.click(trigger);
	await user.keyboard("{ArrowDown}{Enter}");
	expect(change).toHaveBeenCalledWith("admins");
	expect(trigger).toHaveFocus();
	await user.click(trigger);
	await user.keyboard("{Escape}");
	expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	expect(trigger).toHaveFocus();
	expect(view.container.querySelector("select")).toBeNull();
});
