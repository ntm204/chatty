import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	acceptFriendRequestController,
	cancelFriendRequestController,
	declineFriendRequestController,
	followController,
	getRelationshipController,
	listFriendRequestsController,
	listFriendsController,
	sendFriendRequestController,
	unfollowController,
	unfriendController,
} from "./friends.controller.js";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);
friendsRouter.get("/", listFriendsController);
friendsRouter.get("/requests", listFriendRequestsController);
friendsRouter.get("/:userId", getRelationshipController);
// PUT for the idempotent ones: asking twice, or following twice, is the same request.
friendsRouter.put("/:userId/request", sendFriendRequestController);
friendsRouter.delete("/:userId/request", cancelFriendRequestController);
friendsRouter.post("/:userId/accept", acceptFriendRequestController);
friendsRouter.post("/:userId/decline", declineFriendRequestController);
friendsRouter.delete("/:userId", unfriendController);
friendsRouter.put("/:userId/follow", followController);
friendsRouter.delete("/:userId/follow", unfollowController);
