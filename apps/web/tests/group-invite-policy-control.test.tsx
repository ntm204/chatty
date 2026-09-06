import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupInvitePolicyControl } from "@/features/chat/components/group-invite-policy-control";

const setGroupInvitePolicy = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		setGroupInvitePolicy: (conversationId: string, policy: string) => setGroupInvitePolicy(conversationId, policy),
	},
}));

beforeEach(() => {
	setGroupInvitePolicy.mockReset().mockResolvedValue(undefined);
});

describe("GroupInvitePolicyControl", () => {
	it("lets an admin restrict invitations to admins only", async () => {
		const user = userEvent.setup();
		render(<GroupInvitePolicyControl conversationId="group-1" policy="everyone" isAdmin />);

		const toggle = screen.getByRole("switch", { name: "Only admins can add people" });
		expect(toggle).toHaveAttribute("aria-checked", "false");

		await user.click(toggle);

		expect(setGroupInvitePolicy).toHaveBeenCalledWith("group-1", "managers");
	});

	it("lets an admin turn the restriction back off", async () => {
		const user = userEvent.setup();
		render(<GroupInvitePolicyControl conversationId="group-1" policy="managers" isAdmin />);

		await user.click(screen.getByRole("switch", { name: "Only admins can add people" }));

		expect(setGroupInvitePolicy).toHaveBeenCalledWith("group-1", "everyone");
	});

	it("disables the control and says who can change it, for a non-admin", () => {
		render(<GroupInvitePolicyControl conversationId="group-1" policy="everyone" isAdmin={false} />);

		expect(screen.getByRole("switch", { name: "Only admins can add people" })).toBeDisabled();
		expect(screen.getByText(/only group admins can change this policy/i)).toBeInTheDocument();
	});
});
