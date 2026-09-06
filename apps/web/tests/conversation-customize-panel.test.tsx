import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationCustomizePanel } from "@/features/chat/components/conversation-customize-panel";
import { makeConversation, makeParticipant } from "./factories";

const renameConversation = vi.fn();
const uploadConversationAvatar = vi.fn();
const deleteConversationAvatar = vi.fn();
const setConversationTheme = vi.fn();
const setConversationNickname = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		renameConversation: (conversationId: string, name: string) => renameConversation(conversationId, name),
		uploadConversationAvatar: (conversationId: string, file: File) =>
			uploadConversationAvatar(conversationId, file),
		deleteConversationAvatar: (conversationId: string) => deleteConversationAvatar(conversationId),
		setConversationTheme: (conversationId: string, theme: string | null) =>
			setConversationTheme(conversationId, theme),
		setConversationNickname: (conversationId: string, userId: string, nickname: string | null) =>
			setConversationNickname(conversationId, userId, nickname),
	},
}));

const minh = makeParticipant("minh", "Minh", null, "admin");
const an = makeParticipant("an", "An");

const group = makeConversation({
	id: "group-1",
	isGroup: true,
	name: "Weekend football",
	participants: [minh, an],
});

const direct = makeConversation({
	id: "direct-1",
	isGroup: false,
	name: null,
	participants: [minh, an],
});

beforeEach(() => {
	renameConversation.mockReset().mockResolvedValue(group);
	uploadConversationAvatar.mockReset().mockResolvedValue(group);
	deleteConversationAvatar.mockReset().mockResolvedValue(group);
	setConversationTheme.mockReset().mockResolvedValue(group);
	setConversationNickname.mockReset().mockResolvedValue(group);
});

describe("ConversationCustomizePanel, rename", () => {
	it("renames a group with the trimmed input", async () => {
		const user = userEvent.setup();
		render(
			<ConversationCustomizePanel conversation={group} currentUserId="minh" onlineUserIds={new Set()} isAdmin />,
		);

		await user.click(screen.getByRole("button", { name: /Rename/ }));
		const dialog = screen.getByRole("dialog", { name: "Rename group" });
		const nameField = within(dialog).getByLabelText("Group name");
		await user.clear(nameField);
		await user.type(nameField, "  Sunday football  ");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));

		expect(renameConversation).toHaveBeenCalledWith("group-1", "Sunday football");
	});

	it("disables renaming for a non-admin", () => {
		render(
			<ConversationCustomizePanel
				conversation={group}
				currentUserId="an"
				onlineUserIds={new Set()}
				isAdmin={false}
			/>,
		);

		expect(screen.getByRole("button", { name: /Rename/ })).toBeDisabled();
	});

	it("has no rename row for a direct conversation — there is no group name to change", () => {
		render(
			<ConversationCustomizePanel
				conversation={direct}
				currentUserId="minh"
				onlineUserIds={new Set()}
				isAdmin={false}
			/>,
		);

		expect(screen.queryByRole("button", { name: /Rename/ })).not.toBeInTheDocument();
	});
});

describe("ConversationCustomizePanel, photo", () => {
	it("is admin-gated and group-only", () => {
		const { rerender } = render(
			<ConversationCustomizePanel
				conversation={group}
				currentUserId="an"
				onlineUserIds={new Set()}
				isAdmin={false}
			/>,
		);
		expect(screen.getByRole("button", { name: "Group photo" })).toBeDisabled();

		rerender(
			<ConversationCustomizePanel conversation={direct} currentUserId="minh" onlineUserIds={new Set()} isAdmin />,
		);
		expect(screen.queryByRole("button", { name: "Group photo" })).not.toBeInTheDocument();
	});

	it("uploads a photo when an admin picks a file", async () => {
		const user = userEvent.setup();
		render(
			<ConversationCustomizePanel conversation={group} currentUserId="minh" onlineUserIds={new Set()} isAdmin />,
		);

		await user.click(screen.getByRole("button", { name: "Group photo" }));
		const dialog = screen.getByRole("dialog", { name: "Group photo" });
		const file = new File(["fake"], "photo.png", { type: "image/png" });
		const fileInput = dialog.querySelector<HTMLInputElement>('input[type="file"]');
		if (!fileInput) throw new Error("file input not found");
		await user.upload(fileInput, file);

		expect(uploadConversationAvatar).toHaveBeenCalledWith("group-1", file);
	});
});

describe("ConversationCustomizePanel, theme", () => {
	it("sets the theme when any participant picks a swatch", async () => {
		const user = userEvent.setup();
		render(
			<ConversationCustomizePanel
				conversation={group}
				currentUserId="an"
				onlineUserIds={new Set()}
				isAdmin={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Azure" }));

		expect(setConversationTheme).toHaveBeenCalledWith("group-1", "azure");
	});
});

describe("ConversationCustomizePanel, nicknames", () => {
	it("opens a modal listing every participant, editable in place by any participant", async () => {
		const user = userEvent.setup();
		render(
			<ConversationCustomizePanel
				conversation={group}
				currentUserId="an"
				onlineUserIds={new Set()}
				isAdmin={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Nicknames" }));
		const dialog = screen.getByRole("dialog", { name: "Nicknames" });
		expect(within(dialog).getByText("Minh")).toBeInTheDocument();
		expect(within(dialog).getByText("An")).toBeInTheDocument();

		await user.click(within(dialog).getByRole("button", { name: "Edit Minh's name" }));
		const input = within(dialog).getByLabelText("Name for Minh");
		await user.clear(input);
		await user.type(input, "Boss");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));

		expect(setConversationNickname).toHaveBeenCalledWith("group-1", "minh", "Boss");
	});
});
