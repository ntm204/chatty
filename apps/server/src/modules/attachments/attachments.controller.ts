import type { Request, Response } from "express";
import { ATTACHMENT_TOKEN_TTL_SECONDS } from "../../lib/attachment-token.js";
import { buildContentDisposition } from "../../lib/file-attachment.js";
import { attachmentParamsSchema, attachmentQuerySchema } from "./attachments.schema.js";
import * as attachmentsService from "./attachments.service.js";

/**
 * `private`, unlike the avatar endpoint's `public`: this response belongs to one
 * viewer and must never be held by a shared proxy. `max-age` matches the token's
 * own lifetime, so nothing is cached past the point where the URL stops working
 * anyway — caching it longer would only produce a hit the browser then has to
 * throw away.
 */
const ATTACHMENT_CACHE_CONTROL = `private, max-age=${ATTACHMENT_TOKEN_TTL_SECONDS}`;

export async function getAttachmentUrlsController(req: Request, res: Response): Promise<void> {
	const params = attachmentParamsSchema.parse(req.params);
	const urls = await attachmentsService.getAttachmentUrls(req.userId!, params.attachmentId);
	res.setHeader("Cache-Control", "no-store");
	res.status(200).json(urls);
}

export async function getAttachmentController(req: Request, res: Response): Promise<void> {
	const params = attachmentParamsSchema.parse(req.params);
	const query = attachmentQuerySchema.parse(req.query);
	const attachment = await attachmentsService.getAttachmentFile(params.attachmentId, query.token, query.size);

	res.setHeader("Cache-Control", ATTACHMENT_CACHE_CONTROL);
	res.setHeader("Content-Type", attachment.mediaType);
	res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader(
		"Content-Disposition",
		attachment.kind === "FILE"
			? buildContentDisposition(attachment.fileName ?? "download")
			: `inline; filename="${params.attachmentId}${attachment.kind === "IMAGE" ? ".webp" : ".m4a"}"`,
	);
	// `dotfiles: "allow"` is required, not optional — the default upload directory
	// is `.data/uploads`, and Express's `send` refuses any path with a segment
	// starting with a dot. The same trap the avatar endpoint shipped broken on.
	// Nothing user-supplied reaches this path: the id is checked against
	// [A-Za-z0-9_-]+ before it is joined and the extension is fixed.
	res.status(200).sendFile(attachment.filePath, { dotfiles: "allow" });
}
