import type { Request, Response } from "express";
import { friendParamsSchema } from "./friends.schema.js";
import * as friendsService from "./friends.service.js";

// req.userId is always set: requireAuth runs first (see friends.routes.ts).

export async function listFriendsController(req: Request, res: Response): Promise<void> {
	res.setHeader("Cache-Control", "no-store");
	res.status(200).json(await friendsService.listFriends(req.userId!));
}

export async function listFriendRequestsController(req: Request, res: Response): Promise<void> {
	res.setHeader("Cache-Control", "no-store");
	res.status(200).json(await friendsService.listFriendRequests(req.userId!));
}

export async function getRelationshipController(req: Request, res: Response): Promise<void> {
	const { userId } = friendParamsSchema.parse(req.params);
	res.setHeader("Cache-Control", "no-store");
	res.status(200).json(await friendsService.getRelationship(req.userId!, userId));
}

/** Every change answers with the relationship as it now stands, so a button can redraw from the reply. */
function relationshipAction(action: (currentUserId: string, otherUserId: string) => Promise<unknown>) {
	return async (req: Request, res: Response): Promise<void> => {
		const { userId } = friendParamsSchema.parse(req.params);
		res.status(200).json(await action(req.userId!, userId));
	};
}

export const sendFriendRequestController = relationshipAction(friendsService.sendFriendRequest);
export const cancelFriendRequestController = relationshipAction(friendsService.cancelFriendRequest);
export const acceptFriendRequestController = relationshipAction(friendsService.acceptFriendRequest);
export const declineFriendRequestController = relationshipAction(friendsService.declineFriendRequest);
export const unfriendController = relationshipAction(friendsService.unfriend);
export const followController = relationshipAction(friendsService.follow);
export const unfollowController = relationshipAction(friendsService.unfollow);
