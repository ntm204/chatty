import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { serverError } from "./factories";

const resetPassword = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		resetPassword: (input: unknown) => resetPassword(input),
	},
}));

beforeEach(() => {
	resetPassword.mockReset().mockResolvedValue(undefined);
});

/** The success state renders a Link, which needs a router around it. */
function renderForm(token = "a-token") {
	return render(
		<MemoryRouter>
			<ResetPasswordForm token={token} />
		</MemoryRouter>,
	);
}

async function submit(typist: ReturnType<typeof userEvent.setup>, next: string, confirm = next) {
	await typist.type(screen.getByLabelText("New password"), next);
	await typist.type(screen.getByLabelText("Confirm new password"), confirm);
	await typist.click(screen.getByRole("button", { name: "Set new password" }));
}

describe("ResetPasswordForm", () => {
	it("sends the token from the link with the new password", async () => {
		const typist = userEvent.setup();
		renderForm("token-from-the-email");

		await submit(typist, "BrandNewSecret456");

		expect(resetPassword).toHaveBeenCalledWith({
			token: "token-from-the-email",
			newPassword: "BrandNewSecret456",
		});
	});

	it("does not send anything when the confirmation does not match", async () => {
		const typist = userEvent.setup();
		renderForm();

		await submit(typist, "BrandNewSecret456", "BrandNewSecret457");

		expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
		expect(resetPassword).not.toHaveBeenCalled();
	});

	it("rejects a password below the server's minimum without asking it", async () => {
		const typist = userEvent.setup();
		renderForm();

		await submit(typist, "short");

		expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
		expect(resetPassword).not.toHaveBeenCalled();
	});

	it("offers a way to sign in once it worked", async () => {
		// And does not sign them in itself: reading the mailbox proved the
		// address, which is not the same as having been signed in.
		const typist = userEvent.setup();
		renderForm();

		await submit(typist, "BrandNewSecret456");

		expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
	});

	it("shows the server's message for a spent or expired link", async () => {
		resetPassword.mockRejectedValue(serverError("That reset link is invalid or has expired"));
		const typist = userEvent.setup();
		renderForm();

		await submit(typist, "BrandNewSecret456");

		expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
	});
});
