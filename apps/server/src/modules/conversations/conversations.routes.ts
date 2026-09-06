import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadConversationAvatar } from "../../middlewares/upload-image.js";
import {
	addParticipantController,
	archiveConversationController,
	createConversationController,
	deleteConversationAvatarController,
	getConversationAvatarController,
	getConversationController,
	listConversationsController,
	markReadController,
	muteConversationController,
	pinConversationController,
	removeParticipantController,
	renameConversationController,
	setInvitePolicyController,
	setNicknameController,
	setParticipantRoleController,
	setQuickReactionController,
	setThemeController,
	uploadConversationAvatarController,
} from "./conversations.controller.js";

export const conversationsRouter = Router();

// Unauthenticated, same reasoning as users.routes.ts's GET /:userId/avatar: an
// <img> tag cannot send an Authorization header, and a group photo is no more
// sensitive than a user's public profile picture — addressed by an unguessable
// cuid, never by anything that reveals membership or message content.
conversationsRouter.get("/:conversationId/avatar", getConversationAvatarController);

conversationsRouter.use(requireAuth);
conversationsRouter.get("/", listConversationsController);
conversationsRouter.post("/", createConversationController);
// One row, for the case pagination creates: a message arrives for a conversation
// the client has not loaded, so there is nothing in the sidebar to patch.
conversationsRouter.get("/:conversationId", getConversationController);
// POST, not PUT: this advances a marker rather than replacing a resource, and
// the server may keep the marker where it is when the client asks to move it
// backwards — so the request is not idempotent in the way PUT promises.
conversationsRouter.post("/:conversationId/read", markReadController);
conversationsRouter.put("/:conversationId/archive", archiveConversationController);
conversationsRouter.put("/:conversationId/pin", pinConversationController);
conversationsRouter.put("/:conversationId/mute", muteConversationController);
// Cosmetic, shared with the whole conversation (see ADR 0022) — unlike
// mute/pin/archive above, this is a property of the shared resource, so it
// takes a target id like the role route does rather than always being "me".
conversationsRouter.put("/:conversationId/members/:userId/nickname", setNicknameController);
conversationsRouter.put("/:conversationId/theme", setThemeController);
conversationsRouter.put("/:conversationId/quick-reaction", setQuickReactionController);
conversationsRouter.post("/:conversationId/members", addParticipantController);
// Also how you leave: DELETE .../members/:userId with your own id as the
// target. Removing yourself and being removed are the same operation on the
// same resource — see removeParticipant's doc comment in the service.
conversationsRouter.delete("/:conversationId/members/:userId", removeParticipantController);
conversationsRouter.put("/:conversationId/members/:userId/role", setParticipantRoleController);
conversationsRouter.put("/:conversationId/invite-policy", setInvitePolicyController);
conversationsRouter.post("/:conversationId/avatar", uploadConversationAvatar, uploadConversationAvatarController);
conversationsRouter.delete("/:conversationId/avatar", deleteConversationAvatarController);
// PATCH, not POST: renaming is a partial update of the conversation resource
// itself, and doing it twice with the same name ends in the same state.
conversationsRouter.patch("/:conversationId", renameConversationController);
