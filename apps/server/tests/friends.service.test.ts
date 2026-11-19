import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { blockUser } from "../src/modules/blocks/blocks.service.js";
import {
	acceptFriendRequest,
	cancelFriendRequest,
	declineFriendRequest,
	follow,
	getRelationship,
	listFriendRequests,
	listFriends,
	sendFriendRequest,
	unfollow,
	unfriend,
} from "../src/modules/friends/friends.service.js";
import { createStory, getStoryFeed } from "../src/modules/stories/stories.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

async function makeUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: { email: `${name}@chatty.test`, handle: `${name}_test`, displayName: name, passwordHash: "x" },
		select: { id: true },
	});

	return user.id;
}

async function people() {
	const [minh, an, binh] = await Promise.all(["minh", "an", "binh"].map(makeUser));

	return { minh: minh!, an: an!, binh: binh! };
}

const note = (text: string, audience: "friends" | "followers" | "close_friends") => ({
	text,
	audience,
	durationHours: 24 as const,
});

describe("friend requests, as on Facebook", () => {
	it("sends a request that also follows, and accepting makes friends who follow each other", async () => {
		const { minh, an } = await people();

		expect(await sendFriendRequest(minh, an)).toMatchObject({
			request: "outgoing",
			isFollowing: true,
			isFriend: false,
		});
		expect(await getRelationship(an, minh)).toMatchObject({ request: "incoming", isFollowedBy: true });
		expect((await listFriendRequests(an)).incoming.map((request) => request.user.id)).toEqual([minh]);
		expect((await listFriendRequests(minh)).outgoing.map((request) => request.user.id)).toEqual([an]);
		const rooms = fakeIO.emits.filter((emit) => emit.event === "relationship:changed").map((emit) => emit.room);
		expect(rooms).toEqual(expect.arrayContaining([`user:${minh}`, `user:${an}`]));

		const accepted = await acceptFriendRequest(an, minh);
		expect(accepted).toMatchObject({ isFriend: true, isFollowing: true, isFollowedBy: true, request: null });
		expect((await listFriends(minh)).map((friend) => friend.user.id)).toEqual([an]);
		expect(await listFriendRequests(an)).toEqual({ incoming: [], outgoing: [] });
	});

	it("treats two people asking each other as a yes, and counts mutual friends", async () => {
		const { minh, an, binh } = await people();
		await sendFriendRequest(minh, an);
		expect(await sendFriendRequest(an, minh)).toMatchObject({ isFriend: true });

		await sendFriendRequest(minh, binh);
		await acceptFriendRequest(binh, minh);
		await sendFriendRequest(an, binh);
		await acceptFriendRequest(binh, an);
		expect((await getRelationship(minh, binh)).mutualFriendCount).toBe(1);
	});

	it("cancels and declines quietly, and an answered request cannot be accepted", async () => {
		const { minh, an } = await people();
		await sendFriendRequest(minh, an);
		expect(await cancelFriendRequest(minh, an)).toMatchObject({ request: null, isFollowing: true });

		await sendFriendRequest(minh, an);
		expect(await declineFriendRequest(an, minh)).toMatchObject({ request: null, isFriend: false });
		await expect(acceptFriendRequest(an, minh)).rejects.toBeInstanceOf(NotFoundError);
		await expect(sendFriendRequest(minh, minh)).rejects.toBeInstanceOf(ValidationError);
	});

	it("unfriending ends both follows; following on its own is one-way", async () => {
		const { minh, an } = await people();
		await sendFriendRequest(minh, an);
		await acceptFriendRequest(an, minh);
		expect(await unfriend(minh, an)).toMatchObject({ isFriend: false, isFollowing: false, isFollowedBy: false });

		expect(await follow(an, minh)).toMatchObject({ isFollowing: true, isFriend: false });
		expect(await getRelationship(minh, an)).toMatchObject({ isFollowedBy: true, isFollowing: false });
		expect(await unfollow(an, minh)).toMatchObject({ isFollowing: false });
	});

	it("blocking severs everything, and nobody can ask or follow across a block", async () => {
		const { minh, an } = await people();
		await sendFriendRequest(minh, an);
		await acceptFriendRequest(an, minh);
		await blockUser(an, minh);

		expect(await getRelationship(minh, an)).toMatchObject({
			isFriend: false,
			isFollowing: false,
			isFollowedBy: false,
		});
		await expect(sendFriendRequest(minh, an)).rejects.toBeInstanceOf(NotFoundError);
		await expect(follow(minh, an)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("who sees a note, by friendship", () => {
	it("shows Friends notes to friends who follow, Followers notes to anyone following", async () => {
		const { minh, an, binh } = await people();
		await sendFriendRequest(an, minh);
		await acceptFriendRequest(minh, an);
		await follow(binh, minh);

		await createStory(minh, note("friends only", "friends"));
		expect((await getStoryFeed(an)).authors.map((group) => group.author.id)).toEqual([minh]);
		expect((await getStoryFeed(binh)).authors).toHaveLength(0);

		await createStory(minh, note("everyone following", "followers"));
		expect((await getStoryFeed(binh)).authors[0]?.stories[0]?.text).toBe("everyone following");

		// Unfollowing a friend drops their notes; the friendship stays.
		await unfollow(an, minh);
		await createStory(minh, note("friends again", "friends"));
		expect((await getStoryFeed(an)).authors).toHaveLength(0);
		expect((await getRelationship(an, minh)).isFriend).toBe(true);
	});
});
