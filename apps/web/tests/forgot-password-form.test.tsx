import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { serverError } from "./factories";

const requestPasswordReset = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		requestPasswordReset: (input: unknown) => requestPasswordReset(input),
	},
}));

beforeEach(() => {
	requestPasswordReset.mockReset().mockResolvedValue(undefined);
});

describe("ForgotPasswordForm", () => {
	it("asks the server for a link", async () => {
		const typist = userEvent.setup();
		render(<ForgotPasswordForm />);

		await typist.type(screen.getByLabelText("Email"), "minh@chatty.test{Enter}");

		expect(requestPasswordReset).toHaveBeenCalledWith({ email: "minh@chatty.test" });
	});

	it("never confirms whether the address has an account", async () => {
		// The server answers the same way either way. A UI that said "check your
		// inbox" for one address and "no such account" for another would hand back
		// exactly the membership check the endpoint refuses to answer.
		const typist = userEvent.setup();
		render(<ForgotPasswordForm />);

		await typist.type(screen.getByLabelText("Email"), "nobody@chatty.test{Enter}");

		expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
	});

	it("does not call the server with an empty address", async () => {
		const typist = userEvent.setup();
		render(<ForgotPasswordForm />);

		await typist.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(screen.getByText("Email is required")).toBeInTheDocument();
		expect(requestPasswordReset).not.toHaveBeenCalled();
	});

	it("shows a rate limit rather than pretending it worked", async () => {
		requestPasswordReset.mockRejectedValue(serverError("Too many password reset requests. Try again later."));
		const typist = userEvent.setup();
		render(<ForgotPasswordForm />);

		await typist.type(screen.getByLabelText("Email"), "minh@chatty.test{Enter}");

		expect(await screen.findByText(/too many/i)).toBeInTheDocument();
	});
});
