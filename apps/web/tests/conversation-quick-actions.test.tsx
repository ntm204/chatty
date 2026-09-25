import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationQuickActions } from "@/features/chat/components/conversation-quick-actions";
import { makeConversation } from "./factories";

vi.mock("@/api/client", () => ({ api: { setConversationMuted: vi.fn() } }));

beforeEach(() => {
	vi.mocked(api.setConversationMuted).mockReset();
});

describe("details mute actions", () => {
	it("catches failures, keeps the menu actionable and closes only after a successful retry", async () => {
		const user = userEvent.setup();
		vi.mocked(api.setConversationMuted).mockRejectedValueOnce(new Error("Cannot save mute"));
		render(<ConversationQuickActions conversation={makeConversation()} onOpenSearch={() => undefined} />);
		await user.click(screen.getByRole("button", { name: "Mute notifications" }));
		await user.click(screen.getByRole("menuitem", { name: "15 minutes" }));
		expect(screen.getByRole("alert")).toHaveTextContent("Cannot save mute");
		expect(screen.getByRole("menuitem", { name: "15 minutes" })).toBeEnabled();
		vi.mocked(api.setConversationMuted).mockResolvedValueOnce({
			conversationId: "conversation-1",
			isPinned: false,
			isArchived: false,
			mutedUntil: null,
		});
		await user.click(screen.getByRole("menuitem", { name: "15 minutes" }));
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("preserves pending state and a late failure when the menu is dismissed", async () => {
		let rejectRequest!: (error: Error) => void;
		vi.mocked(api.setConversationMuted).mockReturnValue(
			new Promise((_, reject) => {
				rejectRequest = reject;
			}),
		);
		const user = userEvent.setup();
		render(<ConversationQuickActions conversation={makeConversation()} onOpenSearch={() => undefined} />);
		const trigger = screen.getByRole("button", { name: "Mute notifications" });
		await user.click(trigger);
		await user.click(screen.getByRole("menuitem", { name: "Forever" }));
		await user.click(trigger);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveAttribute("aria-busy", "true");
		await user.click(trigger);
		await user.click(screen.getByRole("menuitem", { name: "Forever" }));
		expect(api.setConversationMuted).toHaveBeenCalledTimes(1);
		await user.click(trigger);
		await act(async () => rejectRequest(new Error("Mute was not confirmed")));
		expect(screen.getByRole("alert")).toHaveTextContent("Mute was not confirmed");
		await user.click(screen.getByRole("button", { name: "Dismiss conversation error" }));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
