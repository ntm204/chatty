import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationVaultPanel } from "@/features/chat/components/conversation-vault-panel";
import { makeAttachment, makeConversation, makeParticipant } from "./factories";

vi.mock("@/api/client", () => ({
	api: {
		getConversationVaultSummary: vi.fn(),
		listConversationMedia: vi.fn(),
		listConversationLinks: vi.fn(),
		listBlockedUsers: vi.fn(),
		getBlockStatus: vi.fn(),
		listRestrictedUsers: vi.fn(),
		getRestrictionStatus: vi.fn(),
	},
}));

const image = {
	...makeAttachment({ id: "photo-1", thumbUrl: "http://api.test/photo-thumb" }),
	messageId: "message-1",
	messageCreatedAt: "2026-08-12T10:00:00.000Z",
	authorName: "An",
};

beforeEach(() => {
	vi.mocked(api.getConversationVaultSummary)
		.mockReset()
		.mockResolvedValue({ media: 1, files: 0, voice: 0, links: 0, saved: 0 });
	vi.mocked(api.listConversationMedia)
		.mockReset()
		.mockResolvedValue({ items: [image], hasMore: false });
	vi.mocked(api.listConversationLinks).mockReset().mockResolvedValue({ items: [], hasMore: false });
	// Blocking stays in details; restriction status belongs to the sidebar menu.
	vi.mocked(api.getBlockStatus).mockReset().mockResolvedValue({ isBlocked: false });
	vi.mocked(api.getRestrictionStatus).mockReset().mockResolvedValue({ isRestricted: false });
});

function renderPanel(overrides: { isGroup?: boolean } = {}) {
	const onOpenMessage = vi.fn();
	render(
		<ConversationVaultPanel
			conversation={makeConversation({
				isGroup: overrides.isGroup ?? false,
				name: overrides.isGroup ? "Team" : null,
				participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			})}
			currentUserId="minh"
			onlineUserIds={new Set(["an"])}
			onClose={vi.fn()}
			onOpenSearch={vi.fn()}
			onOpenMessage={onOpenMessage}
		/>,
	);

	return onOpenMessage;
}

describe("ConversationVaultPanel", () => {
	/**
	 * The counts are the reason this is a list and not a tab bar, and they have to
	 * arrive before anything is opened — that is what answers "is there anything
	 * in Files?" without a request and a spinner.
	 */
	it("opens on the categories and their counts, fetching no page yet", async () => {
		renderPanel();

		await userEvent.setup().click(screen.getByRole("button", { name: "Media, files and links" }));
		expect(await screen.findByRole("button", { name: "Media, 1" })).toBeInTheDocument();
		expect(api.listConversationMedia).not.toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: /restrict/iu })).not.toBeInTheDocument();
		expect(api.getRestrictionStatus).not.toHaveBeenCalled();
	});

	it("groups media by month and opens the loaded set in the shared lightbox", async () => {
		const user = userEvent.setup();
		const onOpenMessage = renderPanel();

		await user.click(screen.getByRole("button", { name: "Media, files and links" }));
		await user.click(await screen.findByRole("button", { name: "Media, 1" }));

		expect(await screen.findByText("August 2026")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Shared by An" }));
		expect(screen.getByRole("dialog", { name: "Image preview" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "View in conversation" }));
		await waitFor(() => expect(onOpenMessage).toHaveBeenCalledWith("message-1"));
	});

	it("stays open while interacting elsewhere and closes with its explicit control", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<>
				<button type="button">somewhere else</button>
				<ConversationVaultPanel
					conversation={makeConversation({
						participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
					})}
					currentUserId="minh"
					onlineUserIds={new Set()}
					onClose={onClose}
					onOpenSearch={vi.fn()}
					onOpenMessage={vi.fn()}
				/>
			</>,
		);

		await user.click(screen.getByRole("button", { name: "Media, files and links" }));
		await user.click(await screen.findByRole("button", { name: "Media, 1" }));
		expect(onClose).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "somewhere else" }));
		expect(onClose).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Close conversation storage" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	/**
	 * Members is its own inline section for a group, collapsed by default like
	 * the other secondary sections — see ADR 0022.
	 */
	it("opens a group's Members section inline, without leaving the overview", async () => {
		const user = userEvent.setup();
		renderPanel({ isGroup: true });

		await user.click(screen.getByRole("button", { name: "Members" }));
		expect(screen.getByRole("button", { name: "Leave group" })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Media, files and links" }));
		expect(screen.getByRole("button", { name: "Media, 1" })).toBeInTheDocument();
	});
});
