import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationActions } from "@/features/chat/components/conversation-actions";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { makeConversation, makeParticipant } from "./factories";

const UPDATED_CONVERSATION = {
	conversationId: "conversation-1",
	isPinned: false,
	isArchived: false,
	mutedUntil: null,
	nickname: null,
};

vi.mock("@/api/client", () => ({
	api: {
		setConversationArchived: vi.fn(),
		setConversationPinned: vi.fn(),
		setConversationMuted: vi.fn(),
		getBlockStatus: vi.fn(),
		getRestrictionStatus: vi.fn(),
		restrictUser: vi.fn(),
		unrestrictUser: vi.fn(),
	},
}));

beforeEach(() => {
	vi.mocked(api.setConversationArchived).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
	vi.mocked(api.setConversationPinned).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
	vi.mocked(api.setConversationMuted).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
	vi.mocked(api.getBlockStatus).mockReset().mockResolvedValue({ isBlocked: false });
	vi.mocked(api.getRestrictionStatus).mockReset().mockResolvedValue({ isRestricted: false });
	vi.mocked(api.restrictUser).mockReset().mockResolvedValue(undefined);
	vi.mocked(api.unrestrictUser).mockReset().mockResolvedValue(undefined);
	useBlockedUsers.getState().reset();
	useRestrictedUsers.getState().reset();
});

function renderDirectActions() {
	render(
		<ConversationActions
			conversation={makeConversation({
				participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			})}
			currentUserId="minh"
		/>,
	);
}

describe("ConversationActions", () => {
	it("keeps row actions behind one compact trigger", async () => {
		render(<ConversationActions conversation={makeConversation()} currentUserId="minh" />);

		expect(screen.getByRole("button", { name: "Conversation actions" })).toBeInTheDocument();
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(document.querySelector("select")).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Conversation actions" }));

		expect(screen.getByRole("menuitem", { name: "Pin conversation" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Mute" })).toBeInTheDocument();
	});

	it("closes on a second trigger click and restores keyboard focus with Escape", async () => {
		const user = userEvent.setup();
		renderDirectActions();
		const trigger = screen.getByRole("button", { name: "Conversation actions" });
		await user.click(trigger);
		await user.click(trigger);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		await user.click(trigger);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("uses an in-app mute submenu instead of a native dropdown", async () => {
		const user = userEvent.setup();
		render(<ConversationActions conversation={makeConversation()} currentUserId="minh" />);

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Mute" }));

		expect(screen.getByRole("menuitem", { name: "15 minutes" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "1 hour" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "8 hours" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "24 hours" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Forever" })).toBeInTheDocument();
		expect(document.querySelector("select")).not.toBeInTheDocument();

		await user.click(screen.getByRole("menuitem", { name: "8 hours" }));
		expect(api.setConversationMuted).toHaveBeenCalledWith(
			"conversation-1",
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
		);
	});

	it("shows the inverse actions for an organised conversation", async () => {
		render(
			<ConversationActions
				conversation={makeConversation({
					isPinned: true,
					isArchived: true,
					mutedUntil: "9999-12-31T23:59:59.999Z",
				})}
				currentUserId="minh"
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Conversation actions" }));

		expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Muted" })).toBeInTheDocument();
	});

	it("restricts and unrestricts a direct peer from the row menu without confirmation", async () => {
		const user = userEvent.setup();
		renderDirectActions();

		expect(api.getRestrictionStatus).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		expect(api.getRestrictionStatus).toHaveBeenCalledWith("an");
		await user.click(screen.getByRole("menuitem", { name: "Restrict" }));

		expect(api.restrictUser).toHaveBeenCalledWith("an");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Unrestrict" }));
		expect(api.unrestrictUser).toHaveBeenCalledWith("an");
		expect(useRestrictedUsers.getState().restrictedIds.has("an")).toBe(false);
	});

	it("loads the existing restriction and follows changes from the shared store", async () => {
		vi.mocked(api.getRestrictionStatus).mockResolvedValue({ isRestricted: true });
		const user = userEvent.setup();
		renderDirectActions();

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		expect(await screen.findByRole("menuitem", { name: "Unrestrict" })).toBeInTheDocument();
		act(() => useRestrictedUsers.getState().apply("an", false));

		expect(screen.getByRole("menuitem", { name: "Restrict" })).toBeInTheDocument();
	});

	it("keeps a failed restriction actionable and reports the error in the menu", async () => {
		vi.mocked(api.restrictUser).mockRejectedValueOnce(new Error("Could not restrict this person"));
		const user = userEvent.setup();
		renderDirectActions();

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Restrict" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Could not restrict this person");
		expect(screen.getByRole("menuitem", { name: "Restrict" })).toBeEnabled();
		expect(useRestrictedUsers.getState().restrictedIds.has("an")).toBe(false);

		await user.click(screen.getByRole("menuitem", { name: "Restrict" }));
		expect(api.restrictUser).toHaveBeenCalledTimes(2);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	});

	it("prevents another row mutation while the restriction request is pending", async () => {
		let resolveRestriction!: () => void;
		const restrictionPromise = new Promise<void>((resolve) => {
			resolveRestriction = resolve;
		});
		vi.mocked(api.restrictUser).mockReturnValue(restrictionPromise);
		const user = userEvent.setup();
		renderDirectActions();

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Restrict" }));

		expect(screen.getByRole("menu")).toHaveAttribute("aria-busy", "true");
		expect(screen.getByRole("menuitem", { name: "Restrict" })).toBeDisabled();
		expect(screen.getByRole("menuitem", { name: "Block" })).toBeDisabled();
		await user.click(screen.getByRole("menuitem", { name: "Restrict" }));
		expect(api.restrictUser).toHaveBeenCalledTimes(1);

		await act(async () => resolveRestriction());
		await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
	});

	it("offers neither restrict nor block on group conversations", async () => {
		render(
			<ConversationActions
				conversation={makeConversation({
					isGroup: true,
					participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
				})}
				currentUserId="minh"
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Conversation actions" }));

		expect(screen.queryByRole("menuitem", { name: /restrict|block/iu })).not.toBeInTheDocument();
		expect(api.getRestrictionStatus).not.toHaveBeenCalled();
		expect(api.getBlockStatus).not.toHaveBeenCalled();
	});
});
