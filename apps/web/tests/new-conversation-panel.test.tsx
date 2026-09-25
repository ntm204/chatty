import type { UserDTO } from "@chatty/shared-types";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewConversationPanel } from "@/features/chat/components/new-conversation-panel";

const searchUsers = vi.fn();
const createConversation = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		searchUsers: (query: string) => searchUsers(query),
		createConversation: (participantIds: string[], name?: string) => createConversation(participantIds, name),
	},
}));

function makeUser(id: string, displayName: string): UserDTO {
	return {
		id,
		handle: id,
		displayName,
		avatarUrl: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		lastSeenAt: null,
	};
}

const foundUsers = [makeUser("an", "An"), makeUser("binh", "Binh"), makeUser("chi", "Chi")];

beforeEach(() => {
	searchUsers.mockReset().mockResolvedValue(foundUsers);
	createConversation.mockReset().mockResolvedValue({ id: "new-conversation" });
});

/** Types a query and submits, leaving the results rendered. */
async function search(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText("Find someone"), "a{Enter}");
	await screen.findByRole("button", { name: "An @an" });
}

describe("NewConversationPanel", () => {
	it("opens message search from the shared search row without submitting people search", () => {
		const onOpenMessageSearch = vi.fn();
		render(<NewConversationPanel onConversationStarted={vi.fn()} onOpenMessageSearch={onOpenMessageSearch} />);
		const input = screen.getByRole("textbox", { name: "Find someone" });
		fireEvent.change(input, { target: { value: "Lan" } });
		fireEvent.click(screen.getByRole("button", { name: "Search all messages" }));
		expect(onOpenMessageSearch).toHaveBeenCalledOnce();
		expect(searchUsers).not.toHaveBeenCalled();
		expect(input).toHaveValue("Lan");
	});
	it("shows a direct-chat button when exactly one person is selected", async () => {
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);

		await user.click(screen.getByRole("button", { name: "An @an" }));

		expect(screen.getByRole("button", { name: "Chat with An" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Group name (optional)")).not.toBeInTheDocument();
	});

	it("switches to group mode once a second person is selected", async () => {
		// The threshold must match the server's rule for `isGroup`; if the two
		// disagree the UI promises something the API will not do.
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);

		await user.click(screen.getByRole("button", { name: "An @an" }));
		await user.click(screen.getByRole("button", { name: "Binh @binh" }));

		expect(screen.getByRole("button", { name: "Create group with 2 people" })).toBeInTheDocument();
		expect(screen.getByLabelText("Group name (optional)")).toBeInTheDocument();
	});

	it("deselects a person when their result is clicked again", async () => {
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);

		await user.click(screen.getByRole("button", { name: "An @an" }));
		await user.click(screen.getByRole("button", { name: "An @an" }));

		expect(screen.queryByRole("button", { name: /Chat with/ })).not.toBeInTheDocument();
	});

	it("removes a person via their chip", async () => {
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);
		await user.click(screen.getByRole("button", { name: "An @an" }));

		await user.click(screen.getByRole("button", { name: "Remove An" }));

		expect(screen.queryByRole("button", { name: /Chat with/ })).not.toBeInTheDocument();
	});

	it("creates a direct conversation without sending a name", async () => {
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);
		await user.click(screen.getByRole("button", { name: "An @an" }));

		await user.click(screen.getByRole("button", { name: "Chat with An" }));

		expect(createConversation).toHaveBeenCalledWith(["an"], undefined);
	});

	it("sends the typed group name when creating a group", async () => {
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);
		await search(user);
		await user.click(screen.getByRole("button", { name: "An @an" }));
		await user.click(screen.getByRole("button", { name: "Binh @binh" }));

		await user.type(screen.getByLabelText("Group name (optional)"), "Weekend football");
		await user.click(screen.getByRole("button", { name: "Create group with 2 people" }));

		expect(createConversation).toHaveBeenCalledWith(["an", "binh"], "Weekend football");
	});

	it("reports the new conversation id and clears the draft", async () => {
		const onConversationStarted = vi.fn();
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={onConversationStarted} />);
		await search(user);
		await user.click(screen.getByRole("button", { name: "An @an" }));

		await user.click(screen.getByRole("button", { name: "Chat with An" }));

		expect(onConversationStarted).toHaveBeenCalledWith("new-conversation");
		expect(screen.queryByRole("button", { name: /Chat with/ })).not.toBeInTheDocument();
	});

	it("distinguishes two people who share a display name", async () => {
		// The reason handles exist. Without one shown, these two rows are identical
		// and there is no way to tell which "Minh" you are about to message.
		searchUsers.mockResolvedValue([makeUser("minh", "Minh"), makeUser("minh_hcm", "Minh")]);
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);

		await user.type(screen.getByLabelText("Find someone"), "minh{Enter}");

		expect(await screen.findByRole("button", { name: "Minh @minh" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Minh @minh_hcm" })).toBeInTheDocument();
	});

	it("surfaces a failed search instead of failing silently", async () => {
		searchUsers.mockRejectedValue(new Error("Network is down"));
		const user = userEvent.setup();
		render(<NewConversationPanel onConversationStarted={vi.fn()} />);

		await user.type(screen.getByLabelText("Find someone"), "a{Enter}");

		expect(await screen.findByText("Network is down")).toBeInTheDocument();
	});
});
