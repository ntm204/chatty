import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountForm } from "@/features/profile/components/delete-account-form";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, serverError } from "./factories";

const deleteAccount = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		deleteAccount: (input: unknown) => deleteAccount(input),
	},
	clearStoredToken: vi.fn(),
	getStoredToken: vi.fn(),
	storeSession: vi.fn(),
}));

vi.mock("@/lib/socket", () => ({ closeSocket: vi.fn() }));

beforeEach(() => {
	deleteAccount.mockReset().mockResolvedValue(undefined);
	// The real store: what this form is for is ending the session, and a mocked
	// store would prove nothing about that.
	useAuth.setState({ currentUser: makeCurrentUser() });
});

describe("DeleteAccountForm", () => {
	it("sends nothing until the second, deliberate confirmation", async () => {
		// One red button next to "Change password" is one mis-click away from an
		// account that no longer exists.
		const typist = userEvent.setup();
		render(<DeleteAccountForm />);

		await typist.click(screen.getByRole("button", { name: "Delete my account" }));

		expect(deleteAccount).not.toHaveBeenCalled();
		expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
	});

	it("deletes with the password and leaves the browser signed out", async () => {
		const typist = userEvent.setup();
		render(<DeleteAccountForm />);

		await typist.click(screen.getByRole("button", { name: "Delete my account" }));
		await typist.type(screen.getByLabelText("Confirm with your password"), "SuperSecret123");
		await typist.click(screen.getByRole("button", { name: "Delete permanently" }));

		expect(deleteAccount).toHaveBeenCalledWith({ currentPassword: "SuperSecret123" });
		expect(useAuth.getState().currentUser).toBeNull();
	});

	it("keeps the session when the password is wrong", async () => {
		deleteAccount.mockRejectedValue(serverError("Current password is incorrect"));
		const typist = userEvent.setup();
		render(<DeleteAccountForm />);

		await typist.click(screen.getByRole("button", { name: "Delete my account" }));
		await typist.type(screen.getByLabelText("Confirm with your password"), "wrong");
		await typist.click(screen.getByRole("button", { name: "Delete permanently" }));

		expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
		expect(useAuth.getState().currentUser).not.toBeNull();
	});
});
