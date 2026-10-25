import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { RegisterForm } from "@/features/auth/components/register-form";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser } from "./factories";

const uploadAvatar = vi.fn();

vi.mock("@/api/client", () => ({
	api: { uploadAvatar: (file: File) => uploadAvatar(file), deleteAvatar: vi.fn() },
	storeSession: vi.fn(),
	getStoredToken: () => null,
	clearStoredToken: () => undefined,
}));

beforeEach(() => {
	uploadAvatar.mockReset();
});

describe("account form feedback (XP-44)", () => {
	it("puts a taken email beside the email field, keeps what was typed and focuses it", async () => {
		const register = vi.fn().mockRejectedValue(new Error("Email already registered"));
		useAuth.setState({ register } as never);
		const typist = userEvent.setup();
		render(<RegisterForm />);

		await typist.type(screen.getByLabelText("Display name"), "Minh");
		await typist.type(screen.getByLabelText("Handle"), "minh_x");
		await typist.type(screen.getByLabelText("Email"), "taken@chatty.test");
		await typist.type(screen.getByLabelText("Password"), "SuperSecret123");
		await typist.click(screen.getByRole("button", { name: "Create account" }));

		const email = screen.getByLabelText("Email");
		await waitFor(() => expect(email).toHaveFocus());
		expect(email).toHaveAccessibleDescription("Email already registered");
		expect(email).toHaveValue("taken@chatty.test");
		expect(screen.getByLabelText("Password")).toHaveValue("SuperSecret123");
		await typist.type(email, "x");
		expect(email).not.toHaveAccessibleDescription("Email already registered");
	});

	it("labels sign-in identity for password managers: email is the username, handle is not", () => {
		useAuth.setState({ register: vi.fn() } as never);
		render(<RegisterForm />);

		expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
		expect(screen.getByLabelText("Handle")).toHaveAttribute("autocomplete", "nickname");
		expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
	});

	it("refuses an oversized picture before uploading and keeps the current one", async () => {
		const user = makeCurrentUser({ avatarUrl: "https://example.test/old.png" });
		useAuth.setState({ currentUser: user } as never);
		const typist = userEvent.setup();
		const { container } = render(<CurrentUserAvatar user={user} />);
		const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
		const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" });

		await typist.upload(input, huge);

		expect(await screen.findByRole("alert")).toHaveTextContent("over 5 MB");
		expect(uploadAvatar).not.toHaveBeenCalled();
		expect(useAuth.getState().currentUser?.avatarUrl).toBe("https://example.test/old.png");
	});
});
