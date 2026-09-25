import { Router } from "express";
import { getAttachmentController, getAttachmentUrlsController } from "./attachments.controller.js";
import { requireAuth } from "../../middlewares/require-auth.js";

export const attachmentsRouter = Router();

/**
 * The second, and last, unauthenticated route in the app.
 *
 * Deliberately has no `requireAuth`: an `<img>` tag cannot send an
 * Authorization header, and this app keeps its token in localStorage rather
 * than a cookie. The signed `token` query parameter carries the proof instead,
 * and unlike `GET /users/:id/avatar` it is not enough to merely be unguessable
 * — an attachment is private content inside a conversation, so the token is
 * checked, scoped to this one id, and expires.
 */
attachmentsRouter.get("/:attachmentId", getAttachmentController);
attachmentsRouter.get("/:attachmentId/urls", requireAuth, getAttachmentUrlsController);
