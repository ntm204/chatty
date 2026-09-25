import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { AddGroupMembersDialog } from "@/features/chat/components/add-group-members-dialog";
import { makeConversation, makeUser } from "./factories";

vi.mock("@/api/client", () => ({ api: { searchUsers: vi.fn(), addParticipant: vi.fn() } }));

it("retains only failed additions and does not resend successful people on retry", async () => {
	vi.mocked(api.searchUsers).mockResolvedValue([makeUser("an", "An"), makeUser("binh", "Binh")]);
	vi.mocked(api.addParticipant)
		.mockResolvedValueOnce(makeConversation())
		.mockRejectedValueOnce(new Error("Try again"))
		.mockResolvedValueOnce(makeConversation());
	const close = vi.fn();
	render(<AddGroupMembersDialog conversationId="group" participantIds={[]} onClose={close} />);
	const field = screen.getByLabelText("Search for someone to add");
	fireEvent.change(field, { target: { value: "a" } });
	fireEvent.submit(field.closest("form")!);
	fireEvent.click(await screen.findByRole("button", { name: "An @an" }));
	fireEvent.click(screen.getByRole("button", { name: "Binh @binh" }));
	fireEvent.click(screen.getByRole("button", { name: "Add people" }));
	await screen.findByText("Try again");
	expect(screen.queryByRole("button", { name: "Remove An" })).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Remove Binh" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Add people" }));
	await waitFor(() => expect(close).toHaveBeenCalledOnce());
	expect(vi.mocked(api.addParticipant).mock.calls.map((call) => call[1])).toEqual(["an", "binh", "binh"]);
});
