import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacySettings } from "@/features/profile/components/privacy-settings";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, serverError } from "./factories";

const updateProfile = vi.fn();

vi.mock("@/api/client", () => ({
	api: { updateProfile: (input: unknown) => updateProfile(input) },
}));

const user = makeCurrentUser();

function renderSettings() {
	// Re-rendered from the store, the way the settings dialog reads the current user.
	function Connected() {
		const current = useAuth((state) => state.currentUser)!;

		return <PrivacySettings user={current} />;
	}

	return render(<Connected />);
}

beforeEach(() => {
	useAuth.setState({ currentUser: user });
	// Echoes the stored profile with the change applied, as the server does.
	updateProfile
		.mockReset()
		.mockImplementation((change: object) => Promise.resolve({ ...useAuth.getState().currentUser, ...change }));
});

describe("PrivacySettings", () => {
	it("saves each switch the moment it flips, sending only that setting", async () => {
		renderSettings();

		await userEvent.click(screen.getByRole("switch", { name: "Read receipts" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ readReceiptsEnabled: false });
		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ typingIndicatorsEnabled: false });
		await userEvent.click(screen.getByRole("switch", { name: "Allow forwarding" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ allowMessageForwarding: false });

		expect(useAuth.getState().currentUser).toMatchObject({
			readReceiptsEnabled: false,
			typingIndicatorsEnabled: false,
			allowMessageForwarding: false,
		});
		expect(screen.getByRole("switch", { name: "Allow forwarding" })).toHaveAttribute("aria-checked", "false");
	});

	it("chooses last seen and the new-chat timer on one-row segmented controls", async () => {
		renderSettings();

		await userEvent.click(screen.getByRole("radio", { name: "Nobody" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ presenceVisibility: "nobody" });
		await userEvent.click(screen.getByRole("radio", { name: "7 days" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ defaultMessageTimerSeconds: 604_800 });
		expect(screen.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByRole("radio", { name: "7 days" })).toHaveTextContent("7d");
	});

	it("says which settings are symmetric and where forwarding protection stops", () => {
		renderSettings();

		expect(screen.getByText(/hides theirs from you/)).toBeInTheDocument();
		expect(screen.getByText(/hides others typing from you/)).toBeInTheDocument();
		expect(screen.getByText(/screenshots can't be fully stopped/)).toBeInTheDocument();
	});

	it("keeps every control usable while a save is in flight, and applies quick taps in order", async () => {
		let release: () => void = () => {};
		updateProfile.mockImplementationOnce(
			(change: object) =>
				new Promise((resolve) => {
					release = () => resolve({ ...useAuth.getState().currentUser, ...change });
				}),
		);
		renderSettings();

		await userEvent.click(screen.getByRole("switch", { name: "Read receipts" }));
		expect(screen.getByRole("switch", { name: "Typing indicator" })).toBeEnabled();
		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));
		expect(updateProfile).toHaveBeenCalledTimes(1);

		release();
		await vi.waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
		expect(updateProfile.mock.calls.map(([change]) => change)).toEqual([
			{ readReceiptsEnabled: false },
			{ typingIndicatorsEnabled: false },
		]);
		await vi.waitFor(() =>
			expect(useAuth.getState().currentUser).toMatchObject({
				readReceiptsEnabled: false,
				typingIndicatorsEnabled: false,
			}),
		);
	});

	it("rolls a refused change back and says why", async () => {
		updateProfile.mockRejectedValueOnce(serverError("Please try again."));
		renderSettings();

		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
		expect(screen.getByRole("switch", { name: "Typing indicator" })).toHaveAttribute("aria-checked", "true");
		expect(useAuth.getState().currentUser?.typingIndicatorsEnabled).toBe(true);
	});
});
