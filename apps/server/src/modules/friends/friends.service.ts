/**
 * Friends and follows, as on Facebook (ADR 0027): a friend request you send
 * also follows them; accepting makes you friends and followers both ways;
 * unfriending ends both follows; unfollowing a friend keeps the friendship but
 * drops their notes from your row. Nobody can befriend or follow across a
 * block, and blocking severs all of it.
 */
import type { FriendDTO, FriendRequestsDTO, RelationshipDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";

/** How many friends or requests one list returns; enough for a personal app, bounded for the server. */
const LIST_LIMIT = 500;

type Client = Prisma.TransactionClient | typeof prisma;

/** The one stored row for a pair: smaller id first. */
function pairOf(firstId: string, secondId: string): { userAId: string; userBId: string } {
	return firstId < secondId ? { userAId: firstId, userBId: secondId } : { userAId: secondId, userBId: firstId };
}

/** Both people's sessions refetch: each learns their relationship with the other changed. */
function announce(firstId: string, secondId: string): void {
	const io = getOptionalIO();
	io?.to(userRoom(firstId)).emit("relationship:changed", { userId: secondId });
	io?.to(userRoom(secondId)).emit("relationship:changed", { userId: firstId });
}

async function assertCanRelate(client: Client, currentUserId: string, otherUserId: string): Promise<void> {
	if (currentUserId === otherUserId) throw new ValidationError("That is you");
	const other = await client.user.findUnique({
		where: { id: otherUserId },
		select: {
			id: true,
			blocksMade: { where: { blockedId: currentUserId }, select: { id: true } },
			blocksReceived: { where: { blockerId: currentUserId }, select: { id: true } },
		},
	});
	// A block in either direction reads as "no such person", the same answer search gives.
	if (!other || other.blocksMade.length > 0 || other.blocksReceived.length > 0) {
		throw new NotFoundError("User not found");
	}
}

/** Everyone `userId` is friends with. */
export async function listFriendIds(userId: string, client: Client = prisma): Promise<string[]> {
	const rows = await client.friendship.findMany({
		where: { OR: [{ userAId: userId }, { userBId: userId }] },
		select: { userAId: true, userBId: true },
	});

	return rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
}

/** Everyone following `userId`. */
export async function listFollowerIds(userId: string, client: Client = prisma): Promise<string[]> {
	const rows = await client.follow.findMany({ where: { followingId: userId }, select: { followerId: true } });

	return rows.map((row) => row.followerId);
}

export async function getRelationship(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	if (currentUserId === otherUserId) throw new ValidationError("That is you");
	const [friendship, following, followedBy, outgoing, incoming, mine, theirs] = await Promise.all([
		prisma.friendship.findUnique({ where: { userAId_userBId: pairOf(currentUserId, otherUserId) } }),
		prisma.follow.findUnique({
			where: { followerId_followingId: { followerId: currentUserId, followingId: otherUserId } },
		}),
		prisma.follow.findUnique({
			where: { followerId_followingId: { followerId: otherUserId, followingId: currentUserId } },
		}),
		prisma.friendRequest.findUnique({
			where: { senderId_receiverId: { senderId: currentUserId, receiverId: otherUserId } },
		}),
		prisma.friendRequest.findUnique({
			where: { senderId_receiverId: { senderId: otherUserId, receiverId: currentUserId } },
		}),
		listFriendIds(currentUserId),
		listFriendIds(otherUserId),
	]);
	const theirSet = new Set(theirs);

	return {
		userId: otherUserId,
		isFriend: friendship !== null,
		isFollowing: following !== null,
		isFollowedBy: followedBy !== null,
		request: outgoing ? "outgoing" : incoming ? "incoming" : null,
		mutualFriendCount: mine.filter((id) => theirSet.has(id)).length,
	};
}

async function befriend(transaction: Prisma.TransactionClient, firstId: string, secondId: string): Promise<void> {
	await transaction.friendship.createMany({ data: [pairOf(firstId, secondId)], skipDuplicates: true });
	await transaction.friendRequest.deleteMany({
		where: {
			OR: [
				{ senderId: firstId, receiverId: secondId },
				{ senderId: secondId, receiverId: firstId },
			],
		},
	});
	await transaction.follow.createMany({
		data: [
			{ followerId: firstId, followingId: secondId },
			{ followerId: secondId, followingId: firstId },
		],
		skipDuplicates: true,
	});
}

/**
 * Asks to be friends, and follows them meanwhile. If they had already asked
 * you, this is a yes — two people asking each other are friends.
 */
export async function sendFriendRequest(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.$transaction(async (transaction) => {
		await assertCanRelate(transaction, currentUserId, otherUserId);
		const isFriend = await transaction.friendship.findUnique({
			where: { userAId_userBId: pairOf(currentUserId, otherUserId) },
			select: { userAId: true },
		});
		if (isFriend) return;
		const theirRequest = await transaction.friendRequest.findUnique({
			where: { senderId_receiverId: { senderId: otherUserId, receiverId: currentUserId } },
			select: { senderId: true },
		});
		if (theirRequest) {
			await befriend(transaction, currentUserId, otherUserId);

			return;
		}
		await transaction.friendRequest.createMany({
			data: [{ senderId: currentUserId, receiverId: otherUserId }],
			skipDuplicates: true,
		});
		await transaction.follow.createMany({
			data: [{ followerId: currentUserId, followingId: otherUserId }],
			skipDuplicates: true,
		});
	});
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

/** Takes back a request you sent. You keep following them, as on Facebook, until you unfollow. */
export async function cancelFriendRequest(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.friendRequest.deleteMany({ where: { senderId: currentUserId, receiverId: otherUserId } });
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

export async function acceptFriendRequest(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.$transaction(async (transaction) => {
		const request = await transaction.friendRequest.findUnique({
			where: { senderId_receiverId: { senderId: otherUserId, receiverId: currentUserId } },
			select: { senderId: true },
		});
		if (!request) throw new NotFoundError("That friend request is no longer there");
		await assertCanRelate(transaction, currentUserId, otherUserId);
		await befriend(transaction, currentUserId, otherUserId);
	});
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

/** Says no quietly: the request goes, nobody is told, and they keep following you until you remove them. */
export async function declineFriendRequest(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.friendRequest.deleteMany({ where: { senderId: otherUserId, receiverId: currentUserId } });
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

/** Ends a friendship and both follows, as unfriending does on Facebook. */
export async function unfriend(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.$transaction((transaction) => severRelationships(transaction, currentUserId, otherUserId));
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

export async function follow(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.$transaction(async (transaction) => {
		await assertCanRelate(transaction, currentUserId, otherUserId);
		await transaction.follow.createMany({
			data: [{ followerId: currentUserId, followingId: otherUserId }],
			skipDuplicates: true,
		});
	});
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

export async function unfollow(currentUserId: string, otherUserId: string): Promise<RelationshipDTO> {
	await prisma.follow.deleteMany({ where: { followerId: currentUserId, followingId: otherUserId } });
	announce(currentUserId, otherUserId);

	return getRelationship(currentUserId, otherUserId);
}

/**
 * Removes every friendship, request and follow between two people, inside the
 * caller's transaction — unfriending, and the half of blocking that is about
 * relationships rather than messages.
 */
export async function severRelationships(
	transaction: Prisma.TransactionClient,
	firstId: string,
	secondId: string,
): Promise<void> {
	await transaction.friendship.deleteMany({ where: pairOf(firstId, secondId) });
	await transaction.friendRequest.deleteMany({
		where: {
			OR: [
				{ senderId: firstId, receiverId: secondId },
				{ senderId: secondId, receiverId: firstId },
			],
		},
	});
	await transaction.follow.deleteMany({
		where: {
			OR: [
				{ followerId: firstId, followingId: secondId },
				{ followerId: secondId, followingId: firstId },
			],
		},
	});
}

/** Your friends, most recent first. */
export async function listFriends(currentUserId: string): Promise<FriendDTO[]> {
	const rows = await prisma.friendship.findMany({
		where: { OR: [{ userAId: currentUserId }, { userBId: currentUserId }] },
		orderBy: { createdAt: "desc" },
		take: LIST_LIMIT,
		select: { createdAt: true, userA: { select: userSelect }, userB: { select: userSelect } },
	});

	return rows.map((row) => ({
		user: toUserDTO(row.userA.id === currentUserId ? row.userB : row.userA, true),
		since: row.createdAt.toISOString(),
	}));
}

export async function listFriendRequests(currentUserId: string): Promise<FriendRequestsDTO> {
	const [incoming, outgoing] = await Promise.all([
		prisma.friendRequest.findMany({
			where: { receiverId: currentUserId },
			orderBy: { createdAt: "desc" },
			take: LIST_LIMIT,
			select: { createdAt: true, sender: { select: userSelect } },
		}),
		prisma.friendRequest.findMany({
			where: { senderId: currentUserId },
			orderBy: { createdAt: "desc" },
			take: LIST_LIMIT,
			select: { createdAt: true, receiver: { select: userSelect } },
		}),
	]);

	return {
		incoming: incoming.map((row) => ({ user: toUserDTO(row.sender), createdAt: row.createdAt.toISOString() })),
		outgoing: outgoing.map((row) => ({ user: toUserDTO(row.receiver), createdAt: row.createdAt.toISOString() })),
	};
}
