import type { RelationshipDTO } from "@chatty/shared-types";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { FriendsDialog } from "@/features/chat/friends/components/friends-dialog";
import { FriendshipActions } from "@/features/chat/friends/components/friendship-actions";
import { makeUser } from "./factories";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock("@/lib/socket", () => ({
	getSocket: () => ({
		on: (name: string, handler: (...args: unknown[]) => void) => listeners.set(name, handler),
		off: (name: string) => listeners.delete(name),
		emit: vi.fn(),
	}),
}));

const an = makeUser("an", "An");

function relationship(overrides: Partial<RelationshipDTO> = {}): RelationshipDTO {
	return {
		userId: "an",
		isFriend: false,
		isFollowing: false,
		isFollowedBy: false,
		request: null,
		mutualFriendCount: 0,
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	listeners.clear();
});

describe("FriendshipActions", () => {
	it("goes Add friend → Cancel request, following meanwhile, as on Facebook", async () => {
		vi.spyOn(api, "getRelationship").mockResolvedValue(relationship({ mutualFriendCount: 2 }));
		const send = vi
			.spyOn(api, "sendFriendRequest")
			.mockResolvedValue(relationship({ request: "outgoing", isFollowing: true }));
		const cancel = vi.spyOn(api, "cancelFriendRequest").mockResolvedValue(relationship({ isFollowing: true }));
		render(<FriendshipActions user={an} />);

		expect(await screen.findByText("2 mutual friends")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Add friend" }));
		expect(send).toHaveBeenCalledWith("an");
		expect(screen.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
		await userEvent.click(screen.getByRole("button", { name: "Cancel request" }));
		expect(cancel).toHaveBeenCalledWith("an");
		expect(screen.getByRole("button", { name: "Add friend" })).toBeInTheDocument();
	});

	it("answers a request with Confirm or Delete, then offers Friends ▾ with unfollow and unfriend", async () => {
		vi.spyOn(api, "getRelationship").mockResolvedValue(relationship({ request: "incoming", isFollowedBy: true }));
		vi.spyOn(api, "acceptFriendRequest").mockResolvedValue(
			relationship({ isFriend: true, isFollowing: true, isFollowedBy: true }),
		);
		const unfriend = vi.spyOn(api, "unfriend").mockResolvedValue(relationship());
		render(<FriendshipActions user={an} />);

		expect(await screen.findByText("An sent you a friend request")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

		await userEvent.click(screen.getByRole("button", { name: "Friends" }));
		const menu = screen.getByRole("menu", { name: "An friendship" });
		expect(within(menu).getByRole("menuitem", { name: "Unfollow" })).toBeInTheDocument();
		await userEvent.click(within(menu).getByRole("menuitem", { name: "Unfriend" }));
		const confirm = await screen.findByRole("dialog", { name: "Unfriend An?" });
		await userEvent.click(within(confirm).getByRole("button", { name: "Unfriend" }));
		expect(unfriend).toHaveBeenCalledWith("an");
		await waitFor(() => expect(screen.getByRole("button", { name: "Add friend" })).toBeInTheDocument());
	});

	it("refetches when the server says the relationship changed", async () => {
		const get = vi.spyOn(api, "getRelationship").mockResolvedValue(relationship());
		render(<FriendshipActions user={an} />);
		await screen.findByRole("button", { name: "Add friend" });

		get.mockResolvedValue(relationship({ isFriend: true, isFollowing: true }));
		act(() => listeners.get("relationship:changed")?.({ userId: "an" }));
		expect(await screen.findByRole("button", { name: "Friends" })).toBeInTheDocument();
	});
});

describe("FriendsDialog", () => {
	it("opens on waiting requests, confirms one, and lists friends and sent requests", async () => {
		const accept = vi.spyOn(api, "acceptFriendRequest").mockResolvedValue(relationship({ isFriend: true }));
		const binh = makeUser("binh", "Binh");
		render(
			<FriendsDialog
				currentUserId="me"
				friends={[{ user: binh, since: "2026-11-18T00:00:00.000Z" }]}
				requests={{
					incoming: [{ user: an, createdAt: "2026-11-18T00:00:00.000Z" }],
					outgoing: [{ user: makeUser("chi", "Chi"), createdAt: "2026-11-18T00:00:00.000Z" }],
				}}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByRole("radio", { name: "Requests" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByText("Friend requests · 1")).toBeInTheDocument();
		expect(within(screen.getByRole("list", { name: "Sent requests" })).getByText("Chi")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Confirm An" }));
		expect(accept).toHaveBeenCalledWith("an");

		await userEvent.click(screen.getByRole("radio", { name: "Friends" }));
		expect(within(screen.getByRole("list", { name: "Your friends" })).getByText("Binh")).toBeInTheDocument();
	});

	it("finds people by name and offers to add them", async () => {
		vi.spyOn(api, "searchUsers").mockResolvedValue([an, makeUser("me", "Me")]);
		vi.spyOn(api, "getRelationship").mockResolvedValue(relationship());
		render(
			<FriendsDialog
				currentUserId="me"
				friends={[]}
				requests={{ incoming: [], outgoing: [] }}
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(screen.getByRole("radio", { name: "Find people" }));
		await userEvent.type(screen.getByLabelText("Find people"), "an");
		const people = await screen.findByRole("list", { name: "People" });
		expect(within(people).queryByText("Me")).not.toBeInTheDocument();
		expect(await within(people).findByRole("button", { name: "Add friend" })).toBeInTheDocument();
	});
});
