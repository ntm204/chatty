import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser } from "./factories";

const updateProfile = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		updateProfile: (input: unknown) => updateProfile(input),
	},
}));

const user = makeCurrentUser({ displayName: "Minh", handle: "minh" });

beforeEach(() => {
	updateProfile.mockReset().mockResolvedValue(makeCurrentUser({ displayName: "Minh Nguyen", handle: "minh" }));
	// The real store, not a mock: ProfileForm's only job after a save is to write
	// the refreshed profile into it, and a mock would prove nothing about that.
	useAuth.setState({ currentUser: user });
});

describe("ProfileForm", () => {
	it("cannot be submitted until something changes", () => {
		render(<ProfileForm user={user} />);

		expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
	});

	it("sends only the field that changed", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		await typist.type(screen.getByLabelText("Display name"), " Nguyen");
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		// No `handle` key at all — sending an untouched field is how a second tab's
		// edit gets overwritten.
		expect(updateProfile).toHaveBeenCalledWith({ displayName: "Minh Nguyen" });
	});

	it("lowercases the handle before sending it", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const handleField = screen.getByLabelText("Handle");
		await typist.clear(handleField);
		await typist.type(handleField, "Minh_Nguyen");
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(updateProfile).toHaveBeenCalledWith({ handle: "minh_nguyen" });
	});

	it("treats a case-only edit of your own handle as no change", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const handleField = screen.getByLabelText("Handle");
		await typist.clear(handleField);
		await typist.type(handleField, "MINH");

		expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
	});

	it("rejects a handle the server would reject, without asking it", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const handleField = screen.getByLabelText("Handle");
		await typist.clear(handleField);
		await typist.type(handleField, "1nope");
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(screen.getByText(/start with a letter/i)).toBeInTheDocument();
		expect(handleField).toHaveFocus();
		expect(updateProfile).not.toHaveBeenCalled();
	});

	it("focuses the first invalid field and clears only the error being corrected", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const nameField = screen.getByLabelText("Display name");
		const handleField = screen.getByLabelText("Handle");
		await typist.clear(nameField);
		await typist.clear(handleField);
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(nameField).toHaveFocus();
		expect(nameField).toHaveAccessibleDescription("Display name is required");
		expect(handleField).toHaveAttribute("aria-invalid", "true");

		await typist.type(nameField, "Mai");
		expect(nameField).toHaveAttribute("aria-invalid", "false");
		expect(screen.queryByText("Display name is required")).not.toBeInTheDocument();
		expect(handleField).toHaveAttribute("aria-invalid", "true");
		expect(updateProfile).not.toHaveBeenCalled();
	});

	it("locks the submitted values while saving and preserves them for retry after a failure", async () => {
		let rejectSave: (reason: Error) => void = () => {};
		updateProfile.mockReturnValueOnce(
			new Promise((_, reject) => {
				rejectSave = reject;
			}),
		);
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const nameField = screen.getByLabelText("Display name");
		await typist.type(nameField, " Nguyen");
		const saveButton = screen.getByRole("button", { name: "Save changes" });
		const form = saveButton.closest("form")!;
		await typist.click(saveButton);

		expect(form).toHaveAttribute("aria-busy", "true");
		expect(nameField).toBeDisabled();
		expect(screen.getByLabelText("Handle")).toBeDisabled();
		expect(screen.getByLabelText(/Send read receipts/)).toBeDisabled();
		for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
		expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
		await typist.type(nameField, " unsaved");
		fireEvent.submit(form);
		expect(nameField).toHaveValue("Minh Nguyen");
		expect(updateProfile).toHaveBeenCalledTimes(1);

		await act(async () => rejectSave(new Error("The network is unavailable")));

		expect(await screen.findByRole("alert")).toHaveTextContent("The network is unavailable");
		expect(form).toHaveAttribute("aria-busy", "false");
		expect(nameField).toBeEnabled();
		expect(nameField).toHaveValue("Minh Nguyen");
		expect(screen.queryByRole("status")).not.toBeInTheDocument();

		await typist.click(screen.getByRole("button", { name: "Save changes" }));
		expect(await screen.findByRole("status")).toHaveTextContent("Profile saved");
		expect(updateProfile).toHaveBeenCalledTimes(2);
		expect(updateProfile).toHaveBeenLastCalledWith({ displayName: "Minh Nguyen" });
	});

	it("shows the server's message when the handle is taken", async () => {
		updateProfile.mockRejectedValue(new Error("Handle already taken"));
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		const handleField = screen.getByLabelText("Handle");
		await typist.clear(handleField);
		await typist.type(handleField, "an_test");
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		// Beside the handle it is about, focused so a screen reader reads it, value kept.
		await waitFor(() => expect(handleField).toHaveFocus());
		expect(handleField).toHaveAccessibleDescription("Handle already taken");
		expect(handleField).toHaveValue("an_test");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		await typist.type(handleField, "2");
		expect(handleField).not.toHaveAccessibleDescription("Handle already taken");
	});

	it("writes the refreshed profile back into the auth store", async () => {
		// Without this the sidebar keeps rendering the old name until a reload.
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		await typist.type(screen.getByLabelText("Display name"), " Nguyen");
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(await screen.findByText("Profile saved")).toBeInTheDocument();
		expect(useAuth.getState().currentUser?.displayName).toBe("Minh Nguyen");
	});

	it("sends the read receipt setting when it is toggled", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		await typist.click(screen.getByLabelText(/Send read receipts/));
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(updateProfile).toHaveBeenCalledWith({ readReceiptsEnabled: false });
	});

	it("says out loud that hiding your receipts also hides everyone else's", async () => {
		// The symmetry is the part people are surprised by, and being surprised by
		// it after the fact is what makes a setting feel like a trick.
		render(<ProfileForm user={user} />);

		expect(screen.getByText(/hides theirs from you/)).toBeInTheDocument();
	});

	it("saves last-seen privacy independently from the profile fields", async () => {
		const typist = userEvent.setup();
		render(<ProfileForm user={user} />);

		await typist.click(screen.getByRole("radio", { name: "Nobody" }));
		await typist.click(screen.getByRole("button", { name: "Save changes" }));

		expect(updateProfile).toHaveBeenCalledWith({ presenceVisibility: "nobody" });
	});
});
