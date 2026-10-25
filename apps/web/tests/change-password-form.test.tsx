import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/features/profile/components/change-password-form";

const changePassword = vi.fn();
const storeSession = vi.fn();
const reconnectSocket = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		changePassword: (input: unknown) => changePassword(input),
	},
	// `useAuth` reaches for these as well, and the form goes through the store
	// rather than calling the API itself — because a password change replaces
	// this session's token and reauthenticates its socket.
	storeSession: (token: string) => storeSession(token),
	getStoredToken: () => null,
	clearStoredToken: () => undefined,
}));

vi.mock("@/lib/socket", () => ({
	closeSocket: vi.fn(),
	reconnectSocket: () => reconnectSocket(),
}));

beforeEach(() => {
	changePassword.mockReset().mockResolvedValue({ token: "replacement-token" });
	storeSession.mockReset();
	reconnectSocket.mockReset();
});

/** Fills all three fields and submits. */
async function submit(
	typist: ReturnType<typeof userEvent.setup>,
	values: { current: string; next: string; confirm?: string },
) {
	await typist.type(screen.getByLabelText("Current password"), values.current);
	await typist.type(screen.getByLabelText("New password"), values.next);
	await typist.type(screen.getByLabelText("Confirm new password"), values.confirm ?? values.next);
	await typist.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordForm", () => {
	it("sends the current and new password", async () => {
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "BrandNewSecret456" });

		// The confirmation is not in the payload — it is a typo check, not a value
		// the server has any use for.
		expect(changePassword).toHaveBeenCalledWith({
			currentPassword: "SuperSecret123",
			newPassword: "BrandNewSecret456",
		});
	});

	it("does not send anything when the confirmation does not match", async () => {
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "BrandNewSecret456", confirm: "BrandNewSecret457" });

		expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("rejects a new password shorter than the server's minimum", async () => {
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "short" });

		expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("rejects reusing the current password", async () => {
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "SuperSecret123" });

		expect(screen.getByText(/must be different/i)).toBeInTheDocument();
		expect(changePassword).not.toHaveBeenCalled();
	});

	it("stores the replacement token and reconnects the existing socket", async () => {
		// The server ended the old socket session. Reauthentication must use the
		// replacement token while retaining the mounted chat's subscriptions.
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "BrandNewSecret456" });

		expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
		expect(storeSession).toHaveBeenCalledWith("replacement-token");
		expect(reconnectSocket).toHaveBeenCalled();
	});

	it("says the other sessions were signed out", async () => {
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "BrandNewSecret456" });

		expect(await screen.findByText(/signed out/i)).toBeInTheDocument();
	});

	it("clears the fields once the password has changed", async () => {
		// Three passwords in plain text have no reason to outlive the request.
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "SuperSecret123", next: "BrandNewSecret456" });

		expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
		expect(screen.getByLabelText("Current password")).toHaveValue("");
		expect(screen.getByLabelText("New password")).toHaveValue("");
		expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
	});

	it("shows the server's message when the current password is wrong", async () => {
		changePassword.mockRejectedValue(new Error("Current password is incorrect"));
		const typist = userEvent.setup();
		render(<ChangePasswordForm />);

		await submit(typist, { current: "NotMyPassword", next: "BrandNewSecret456" });

		const current = screen.getByLabelText("Current password");
		await waitFor(() => expect(current).toHaveFocus());
		expect(current).toHaveAccessibleDescription("Current password is incorrect");
	});
});
