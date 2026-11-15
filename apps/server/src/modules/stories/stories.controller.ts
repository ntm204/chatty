import type { Request, Response } from "express";
import { z } from "zod";
import {
	createStorySchema,
	replyToStorySchema,
	setStoryAudienceSchema,
	setStoryPeopleSchema,
	storyMediaQuerySchema,
} from "./stories.schema.js";
import * as storiesService from "./stories.service.js";

// req.userId is always set on the authenticated routes: requireAuth runs first (see stories.routes.ts)

/** The same id rule as attachments, so nothing but a storage key reaches the file path. */
const mediaParamsSchema = z.object({ mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/u) });
const storyParamsSchema = z.object({ storyId: z.string().min(1).max(64) });

export async function getStoryFeedController(req: Request, res: Response): Promise<void> {
	res.setHeader("Cache-Control", "no-store");
	res.status(200).json(await storiesService.getStoryFeed(req.userId!));
}

export async function createStoryController(req: Request, res: Response): Promise<void> {
	const input = createStorySchema.parse(req.body);
	const files = !Array.isArray(req.files) && req.files ? req.files : {};
	const photo = files.photo?.[0];
	const video = files.video?.[0];
	const story = await storiesService.createStory(
		req.userId!,
		input,
		video ? { kind: "video", buffer: video.buffer } : photo ? { kind: "photo", buffer: photo.buffer } : undefined,
	);
	res.status(201).json(story);
}

export async function deleteStoryController(req: Request, res: Response): Promise<void> {
	const { storyId } = storyParamsSchema.parse(req.params);
	await storiesService.deleteStory(req.userId!, storyId);
	res.status(204).send();
}

export async function setStoryAudienceController(req: Request, res: Response): Promise<void> {
	const { storyId } = storyParamsSchema.parse(req.params);
	const input = setStoryAudienceSchema.parse(req.body);
	res.status(200).json(await storiesService.setStoryAudience(req.userId!, storyId, input));
}

export async function viewStoryController(req: Request, res: Response): Promise<void> {
	const { storyId } = storyParamsSchema.parse(req.params);
	await storiesService.viewStory(req.userId!, storyId);
	res.status(204).send();
}

export async function listStoryViewersController(req: Request, res: Response): Promise<void> {
	const { storyId } = storyParamsSchema.parse(req.params);
	res.status(200).json(await storiesService.listStoryViewers(req.userId!, storyId));
}

export async function replyToStoryController(req: Request, res: Response): Promise<void> {
	const { storyId } = storyParamsSchema.parse(req.params);
	const input = replyToStorySchema.parse(req.body);
	res.status(201).json(await storiesService.replyToStory(req.userId!, storyId, input.content));
}

export async function getStoryAudienceSettingsController(req: Request, res: Response): Promise<void> {
	res.status(200).json(await storiesService.getStoryAudienceSettings(req.userId!));
}

export async function setCloseFriendsController(req: Request, res: Response): Promise<void> {
	const input = setStoryPeopleSchema.parse(req.body);
	res.status(200).json(await storiesService.setCloseFriends(req.userId!, input.userIds));
}

export async function setStoryHiddenController(req: Request, res: Response): Promise<void> {
	const input = setStoryPeopleSchema.parse(req.body);
	res.status(200).json(await storiesService.setStoryHiddenFrom(req.userId!, input.userIds));
}

/**
 * Unauthenticated like the attachment route — an `<img>` cannot send a header —
 * so the signed token is the proof. `private, no-store`: a story ends, and a
 * browser cache must not keep showing it after it has.
 */
export async function getStoryMediaController(req: Request, res: Response): Promise<void> {
	const { mediaId } = mediaParamsSchema.parse(req.params);
	const query = storyMediaQuerySchema.parse(req.query);
	const media = await storiesService.getStoryMediaFile(mediaId, query.token, query.size);

	res.setHeader("Cache-Control", "private, no-store");
	res.setHeader("Content-Type", media.contentType);
	res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader(
		"Content-Disposition",
		`inline; filename="${mediaId}.${media.contentType === "video/mp4" ? "mp4" : "webp"}"`,
	);
	// `dotfiles: "allow"` for the `.data/uploads` default — see the attachment controller.
	// `sendFile` answers Range requests, which is what lets a video seek and start early.
	res.status(200).sendFile(media.filePath, { dotfiles: "allow" });
}
