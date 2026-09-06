import type { ReactElement } from "react";
import { fireEvent, render as renderView, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupMembersPanel } from "@/features/chat/components/group-members-panel";
import { makeConversation, makeParticipant, makeUser } from "./factories";

function render(element: ReactElement) {
	const result = renderView(element);
	for (const button of screen.queryAllByRole("button", { name: /^Actions for/ })) fireEvent.click(button);

	return result;
}

const searchUsers = vi.fn();
const addParticipant = vi.fn();
const removeParticipant = vi.fn();
const setParticipantRole = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		searchUsers: (query: string) => searchUsers(query),
		addParticipant: (conversationId: string, userId: string) => addParticipant(conversationId, userId),
		removeParticipant: (conversationId: string, userId: string) => removeParticipant(conversationId, userId),
		setParticipantRole: (conversationId: string, userId: string, role: string) =>
			setParticipantRole(conversationId, userId, role),
	},
}));

// Minh administers the group in these fixtures: the remove/promote buttons
// are admin-only. A plain member's view of the same panel gets its own test
// at the bottom, and a second admin's gets one further down — see ADR 0021
// for why every admin has equal standing. Renaming, invite policy and the
// rest of "Customize chat" moved to their own sections/tests — see ADR 0022.
const minh = makeParticipant("minh", "Minh", null, "admin");
const an = makeParticipant("an", "An");
const binh = makeParticipant("binh", "Binh");

const group = makeConversation({
	id: "group-1",
	isGroup: true,
	name: "Weekend football",
	participants: [minh, an, binh],
});

beforeEach(() => {
	searchUsers.mockReset().mockResolvedValue([]);
	addParticipant.mockReset().mockResolvedValue(group);
	removeParticipant.mockReset().mockResolvedValue(undefined);
	setParticipantRole.mockReset().mockResolvedValue(group);
});

describe("GroupMembersPanel", () => {
	it("lists every participant, marking the current user's own row", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		// "(you)" renders in its own nested <span>, so it is a separate text node
		// from the name rather than part of one combined string.
		expect(screen.getByText("Minh")).toBeInTheDocument();
		expect(screen.getByText("(you)")).toBeInTheDocument();
		expect(screen.getByText("An")).toBeInTheDocument();
		expect(screen.getByText("Binh")).toBeInTheDocument();
	});

	it("shows no remove button on your own row", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		// A misclick here would kick yourself; "Leave group" is the deliberate
		// action for that instead.
		expect(screen.queryByRole("menuitem", { name: "Remove Minh from the group" })).not.toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Remove An from the group" })).toBeInTheDocument();
	});

	it("removes another member once the removal is confirmed", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("menuitem", { name: "Remove An from the group" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "an");
	});

	it("does not remove anyone when the dialog is cancelled", async () => {
		// The dialog is the whole point of the change: a mis-click on a small icon
		// beside somebody's name used to take them out of the group immediately.
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("menuitem", { name: "Remove An from the group" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(removeParticipant).not.toHaveBeenCalled();
	});

	it("promotes an ordinary member to admin", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("menuitem", { name: "Make An an admin" }));

		expect(setParticipantRole).toHaveBeenCalledWith("group-1", "an", "admin");
	});

	it("leaves the group once leaving is confirmed", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Leave group" }));
		await user.click(screen.getByRole("button", { name: "Leave" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "minh");
	});

	it("excludes current participants from add-people search results", async () => {
		// "An" is already in the group; offering to add them again is meaningless
		// and the server would reject it as a conflict.
		searchUsers.mockResolvedValue([makeUser("an", "An"), makeUser("chi", "Chi")]);
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Add people" }));
		await user.type(screen.getByLabelText("Search for someone to add"), "a{Enter}");

		expect(await screen.findByRole("button", { name: "Chi @chi" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^An /i })).not.toBeInTheDocument();
	});

	it("adds every selected person once Add people is confirmed", async () => {
		searchUsers.mockResolvedValue([makeUser("chi", "Chi")]);
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Add people" }));
		const dialog = screen.getByRole("dialog", { name: "Add people" });
		await user.type(within(dialog).getByLabelText("Search for someone to add"), "chi{Enter}");
		await user.click(await within(dialog).findByRole("button", { name: "Chi @chi" }));

		expect(addParticipant).not.toHaveBeenCalled();

		await user.click(within(dialog).getByRole("button", { name: "Add people" }));

		expect(addParticipant).toHaveBeenCalledWith("group-1", "chi");
	});

	it("surfaces a failed removal instead of failing silently", async () => {
		removeParticipant.mockRejectedValue(new Error("Network is down"));
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("menuitem", { name: "Remove An from the group" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));

		expect(await screen.findByText("Network is down")).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", async () => {
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Close group settings" }));

		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe("GroupMembersPanel, seen by an ordinary member", () => {
	it("offers no way to remove or promote anyone", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.queryByRole("menuitem", { name: "Remove Binh from the group" })).not.toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Remove Minh from the group" })).not.toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Make Binh an admin" })).not.toBeInTheDocument();
	});

	it("still lets them leave", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Leave group" }));
		await user.click(screen.getByRole("button", { name: "Leave" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "an");
	});

	it("marks the admin's row so it is clear who to ask", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByText("Admin")).toBeInTheDocument();
	});

	it("disables Add people when an admin chose manager-only invites", () => {
		render(
			<GroupMembersPanel
				conversation={{ ...group, invitePolicy: "managers" }}
				currentUserId="an"
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Add people" })).toBeDisabled();
		expect(screen.getByText(/only admins add people/i)).toBeInTheDocument();
	});
});

describe("GroupMembersPanel, seen by an admin — symmetric with every other admin", () => {
	it("can invite under manager policy and remove an ordinary member", () => {
		const adminGroup = {
			...group,
			invitePolicy: "managers" as const,
			participants: [minh, { ...an, role: "admin" as const }, binh],
		};
		render(<GroupMembersPanel conversation={adminGroup} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Add people" })).toBeEnabled();
		expect(screen.getByRole("menuitem", { name: "Remove Binh from the group" })).toBeInTheDocument();
		expect(screen.getAllByText("Admin")).toHaveLength(2);
	});

	it("can also remove or demote another admin — nobody is senior", () => {
		const adminGroup = {
			...group,
			participants: [minh, { ...an, role: "admin" as const }, binh],
		};
		render(<GroupMembersPanel conversation={adminGroup} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByRole("menuitem", { name: "Remove Minh from the group" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Remove Minh from the admins" })).toBeInTheDocument();
	});
});
