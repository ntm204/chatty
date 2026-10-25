import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeEmailForm } from "@/features/profile/components/change-email-form";
import { makeCurrentUser } from "./factories";

const requestEmailChange = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		requestEmailChange: (input: unknown) => requestEmailChange(input),
	},
}));

const user = makeCurrentUser({ email: "minh@chatty.test" });

beforeEach(() => {
	requestEmailChange.mockReset().mockResolvedValue(undefined);
});

async function fillAndSubmit(newEmail = "minh.new@chatty.test") {
	const typist = userEvent.setup();
	await typist.type(screen.getByLabelText("New email"), newEmail);
	await typist.type(screen.getByLabelText("Your password"), "SuperSecret123");
	await typist.click(screen.getByRole("button", { name: "Send confirmation link" }));
}

describe("ChangeEmailForm", () => {
	it("asks for the change with the current password", async () => {
		render(<ChangeEmailForm user={user} />);

		await fillAndSubmit();

		expect(requestEmailChange).toHaveBeenCalledWith({
			newEmail: "minh.new@chatty.test",
			currentPassword: "SuperSecret123",
		});
	});

	it("does not claim the address changed — it says which inbox to check", async () => {
		// The whole feature is that nothing has happened yet. "Email updated" here
		// would leave someone who mistyped their address believing they can still
		// sign in with the new one.
		render(<ChangeEmailForm user={user} />);

		await fillAndSubmit();

		expect(await screen.findByText(/Check minh\.new@chatty\.test/)).toBeInTheDocument();
		expect(screen.getByText(/stays minh@chatty\.test until you open it/)).toBeInTheDocument();
	});

	it("shows what the server said when the address is taken", async () => {
		requestEmailChange.mockRejectedValue(new Error("Email already registered"));
		render(<ChangeEmailForm user={user} />);

		await fillAndSubmit();

		const newEmail = screen.getByLabelText("New email");
		await waitFor(() => expect(newEmail).toHaveFocus());
		expect(newEmail).toHaveAccessibleDescription("Email already registered");
		expect(newEmail).toHaveValue("minh.new@chatty.test");
	});
});
