import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadStoryMedia } from "../../middlewares/upload-image.js";
import {
	createStoryController,
	deleteStoryController,
	getStoryAudienceSettingsController,
	getStoryFeedController,
	getStoryMediaController,
	listStoryViewersController,
	replyToStoryController,
	searchNoteMusicController,
	setCloseFriendsController,
	setStoryAudienceController,
	setStoryHiddenController,
	viewStoryController,
} from "./stories.controller.js";

export const storiesRouter = Router();

// Before requireAuth: an <img> cannot authenticate; the signed token does. See the controller.
storiesRouter.get("/media/:mediaId", getStoryMediaController);

storiesRouter.use(requireAuth);
storiesRouter.get("/", getStoryFeedController);
// Multipart with a "photo" or "video" field for a media story, or JSON for a text one.
storiesRouter.post("/", uploadStoryMedia, createStoryController);
storiesRouter.get("/audience", getStoryAudienceSettingsController);
// Before "/:storyId": songs for a note, proxied so the catalogue's rate limit and host checks live in one place.
storiesRouter.get("/music", searchNoteMusicController);
storiesRouter.put("/audience/close-friends", setCloseFriendsController);
storiesRouter.put("/audience/hidden", setStoryHiddenController);
storiesRouter.delete("/:storyId", deleteStoryController);
storiesRouter.put("/:storyId/audience", setStoryAudienceController);
// POST: recording a view is a write, and must never be spent by a prefetch.
storiesRouter.post("/:storyId/view", viewStoryController);
storiesRouter.get("/:storyId/viewers", listStoryViewersController);
storiesRouter.post("/:storyId/reply", replyToStoryController);
