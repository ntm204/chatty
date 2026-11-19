import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupPermissionsControl } from "@/features/chat/details/components/group-permissions-control";
import { getGroupPermissions } from "@/features/chat/details/utils/group-permissions";
import { makeConversation, makeParticipant, serverError } from "./factories";

const setGroupInvitePolicy = vi.fn();
const setGroupInfoPolicy = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		setGroupInvitePolicy: (id: string, policy: string) => setGroupInvitePolicy(id, policy),
		setGroupInfoPolicy: (id: string, policy: string) => setGroupInfoPolicy(id, policy),
	},
}));

const group = makeConversation({ id: "group-1", isGroup: true, invitePolicy: "everyone", infoPolicy: "managers" });

beforeEach(() => {
	setGroupInvitePolicy.mockReset().mockResolvedValue(undefined);
	setGroupInfoPolicy.mockReset().mockResolvedValue(undefined);
});

describe("GroupPermissionsControl", () => {
	it("shows both permissions where they stand and lets an admin flip each", async () => {
		const user = userEvent.setup();
		render(<GroupPermissionsControl conversation={group} isAdmin />);

		const invites = screen.getByRole("switch", { name: "Only admins can add people" });
		const info = screen.getByRole("switch", { name: "Only admins can change name and photo" });
		expect(invites).toHaveAttribute("aria-checked", "false");
		expect(info).toHaveAttribute("aria-checked", "true");

		await user.click(invites);
		expect(setGroupInvitePolicy).toHaveBeenCalledWith("group-1", "managers");
		await user.click(info);
		expect(setGroupInfoPolicy).toHaveBeenCalledWith("group-1", "everyone");
	});

	it("disables both for a member and says who can change them", () => {
		render(<GroupPermissionsControl conversation={group} isAdmin={false} />);

		expect(screen.getByRole("switch", { name: "Only admins can add people" })).toBeDisabled();
		expect(screen.getByRole("switch", { name: "Only admins can change name and photo" })).toBeDisabled();
		expect(screen.getByText("Only group admins can change these.")).toBeInTheDocument();
	});

	it("says a refused change out loud", async () => {
		setGroupInfoPolicy.mockRejectedValueOnce(serverError("Only group admins can do this", 403));
		render(<GroupPermissionsControl conversation={group} isAdmin />);
		await userEvent.click(screen.getByRole("switch", { name: "Only admins can change name and photo" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Only group admins can do this");
	});
});

describe("getGroupPermissions", () => {
	it("lets members edit the name and photo only when the group allows it", () => {
		const members = [makeParticipant("admin", "Admin", null, "admin"), makeParticipant("member", "Member")];
		const closed = makeConversation({ isGroup: true, participants: members, infoPolicy: "managers" });
		const open = { ...closed, infoPolicy: "everyone" as const, invitePolicy: "managers" as const };

		expect(getGroupPermissions(closed, "member")).toMatchObject({
			isAdmin: false,
			canEditInfo: false,
			canInvite: true,
		});
		expect(getGroupPermissions(open, "member")).toMatchObject({ canEditInfo: true, canInvite: false });
		expect(getGroupPermissions(open, "admin")).toMatchObject({ isAdmin: true, canEditInfo: true, canInvite: true });
		expect(getGroupPermissions(open, "stranger")).toMatchObject({ canEditInfo: false, canInvite: false });
	});
});
