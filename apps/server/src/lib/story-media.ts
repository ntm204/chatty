import { env } from "../config/env.js";
import { signAttachmentToken } from "./attachment-token.js";

/**
 * Signed URLs for a story's photo, served by `GET /stories/media/:mediaId`.
 *
 * Same token scheme and storage as attachments, a different route: the
 * attachment endpoint requires an `Attachment` row and so can never serve a
 * story, and the story endpoint checks the story is still live — a token minted
 * in the last minute of a story must not outlive it by an hour.
 */
export function buildStoryMediaUrls(mediaId: string): { url: string; thumbUrl: string; posterUrl: string } {
	const token = signAttachmentToken(mediaId);
	const base = `${env.PUBLIC_URL}/stories/media/${mediaId}?${new URLSearchParams({ token }).toString()}`;

	return { url: base, thumbUrl: `${base}&size=thumb`, posterUrl: `${base}&size=poster` };
}
