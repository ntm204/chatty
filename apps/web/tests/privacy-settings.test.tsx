import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacySettings } from "@/features/profile/components/privacy-settings";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, makeUser, serverError } from "./factories";

const updateProfile = vi.fn();
const setCloseFriends = vi.fn();
const an = makeUser("an", "An");
const binh = makeUser("binh", "Binh");

vi.mock("@/api/client", () => ({
	api: {
		updateProfile: (input: unknown) => updateProfile(input),
		getStoryAudienceSettings: () =>
			Promise.resolve({ contacts: [an, binh], closeFriendIds: [], hiddenIds: ["binh"] }),
		setCloseFriends: (ids: string[]) => setCloseFriends(ids),
		setStoryHiddenFrom: () => Promise.resolve({}),
	},
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

/** Opens one Privacy row — Instagram's list → page — by the start of its accessible name. */
async function open(label: string) {
	await userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${label}`) }));
}

async function back() {
	await userEvent.click(screen.getByRole("button", { name: "Back to privacy" }));
}

beforeEach(() => {
	setCloseFriends.mockReset().mockResolvedValue({});
	useAuth.setState({ currentUser: user });
	// Echoes the stored profile with the change applied, as the server does.
	updateProfile
		.mockReset()
		.mockImplementation((change: object) => Promise.resolve({ ...useAuth.getState().currentUser, ...change }));
});

describe("PrivacySettings", () => {
	it("lists every setting by who it is about, each showing its current value", async () => {
		renderSettings();

		expect(screen.getByRole("heading", { name: "Who can see your activity" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Who can see your notes" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "How others can interact with you" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Read receipts, On" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Forwarding, Allowed" })).toBeInTheDocument();
		expect(await screen.findByRole("button", { name: "Hide notes from, 1 person" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Close friends, None" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Blocked accounts" })).toBeInTheDocument();
	});

	it("saves each switch the moment it flips, sending only that setting, and the list shows it", async () => {
		renderSettings();

		await open("Read receipts");
		await userEvent.click(screen.getByRole("switch", { name: "Read receipts" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ readReceiptsEnabled: false });
		await back();
		await open("Typing indicator");
		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ typingIndicatorsEnabled: false });
		await back();
		await open("Forwarding");
		await userEvent.click(screen.getByRole("switch", { name: "Allow forwarding" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ allowMessageForwarding: false });
		await back();

		expect(useAuth.getState().currentUser).toMatchObject({
			readReceiptsEnabled: false,
			typingIndicatorsEnabled: false,
			allowMessageForwarding: false,
		});
		expect(screen.getByRole("button", { name: "Read receipts, Off" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Forwarding, Off" })).toBeInTheDocument();
	});

	it("chooses active status and the new-chat timer from Instagram-style lists", async () => {
		renderSettings();

		await open("Active status");
		await userEvent.click(screen.getByRole("radio", { name: /^Nobody/ }));
		expect(updateProfile).toHaveBeenLastCalledWith({ presenceVisibility: "nobody" });
		expect(screen.getByRole("radio", { name: /^Nobody/ })).toHaveAttribute("aria-checked", "true");
		await back();
		await open("Disappearing messages");
		await userEvent.click(screen.getByRole("radio", { name: "7 days" }));
		expect(updateProfile).toHaveBeenLastCalledWith({ defaultMessageTimerSeconds: 604_800 });
		expect(screen.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
		await back();
		expect(screen.getByRole("button", { name: "Active status, Nobody" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Disappearing messages, 7 days" })).toBeInTheDocument();
	});

	it("says which settings are symmetric and where forwarding protection stops", async () => {
		renderSettings();

		await open("Read receipts");
		expect(screen.getByText(/hides theirs from you/)).toBeInTheDocument();
		await back();
		await open("Typing indicator");
		expect(screen.getByText(/hides others typing from you/)).toBeInTheDocument();
		await back();
		await open("Forwarding");
		expect(screen.getByText(/screenshots can't be fully stopped/)).toBeInTheDocument();
	});

	it("applies quick taps in order while a save is in flight", async () => {
		let release: () => void = () => {};
		updateProfile.mockImplementationOnce(
			(change: object) =>
				new Promise((resolve) => {
					release = () => resolve({ ...useAuth.getState().currentUser, ...change });
				}),
		);
		renderSettings();

		await open("Read receipts");
		await userEvent.click(screen.getByRole("switch", { name: "Read receipts" }));
		await back();
		await open("Typing indicator");
		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));
		expect(updateProfile).toHaveBeenCalledTimes(1);

		release();
		await vi.waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
		expect(updateProfile.mock.calls.map(([change]) => change)).toEqual([
			{ readReceiptsEnabled: false },
			{ typingIndicatorsEnabled: false },
		]);
	});

	it("rolls a refused change back and says why", async () => {
		updateProfile.mockRejectedValueOnce(serverError("Please try again."));
		renderSettings();

		await open("Typing indicator");
		await userEvent.click(screen.getByRole("switch", { name: "Typing indicator" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
		expect(screen.getByRole("switch", { name: "Typing indicator" })).toHaveAttribute("aria-checked", "true");
		expect(useAuth.getState().currentUser?.typingIndicatorsEnabled).toBe(true);
	});

	it("picks close friends Instagram's way — search, tap, saved at once — and undoes a refused save", async () => {
		renderSettings();

		await open("Close friends");
		await userEvent.type(screen.getByLabelText("Search close friends"), "an");
		const list = screen.getByRole("list", { name: "close friends" });
		expect(within(list).queryByText("Binh")).not.toBeInTheDocument();
		await userEvent.click(within(list).getByRole("switch", { name: "An in close friends" }));
		expect(setCloseFriends).toHaveBeenLastCalledWith(["an"]);
		expect(within(list).getByRole("switch", { name: "An in close friends" })).toHaveAttribute(
			"aria-checked",
			"true",
		);

		setCloseFriends.mockRejectedValueOnce(serverError("Try later."));
		await userEvent.click(within(list).getByRole("switch", { name: "An in close friends" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Try later.");
		expect(within(list).getByRole("switch", { name: "An in close friends" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await back();
		expect(screen.getByRole("button", { name: "Close friends, 1 person" })).toBeInTheDocument();
	});
});
