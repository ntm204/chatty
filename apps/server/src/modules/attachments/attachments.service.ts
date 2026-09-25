import { buildAttachmentUrls, findAttachmentPath } from "../../lib/attachment-storage.js";
import type { AttachmentDTO } from "@chatty/shared-types";
import { isValidAttachmentToken } from "../../lib/attachment-token.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/** Renew only from current membership and message visibility, never from an expired token. */
export async function getAttachmentUrls(
	userId: string,
	attachmentId: string,
): Promise<Pick<AttachmentDTO, "url" | "thumbUrl">> {
	const attachment = await prisma.attachment.findFirst({
		where: {
			id: attachmentId,
			message: {
				deletedAt: null,
				hiddenFor: { none: { userId } },
				conversation: { participants: { some: { userId } } },
			},
		},
		select: { id: true, kind: true, hasThumbnail: true },
	});
	if (!attachment) throw new NotFoundError("Attachment no longer available");

	return buildAttachmentUrls(attachment.id, attachment.kind === "IMAGE" && attachment.hasThumbnail);
}

/**
 * Path of the file to serve for `GET /attachments/:attachmentId`.
 *
 * Returns a path rather than bytes so the controller can hand it to
 * `res.sendFile`, which sets the caching and range headers an image response
 * wants — reading it into a Buffer here would mean re-implementing those.
 *
 * A bad token answers 404 rather than 401, and the difference matters: 401
 * would confirm that an attachment with this id exists, which is exactly what
 * someone walking the id space is trying to find out. The two failures are
 * indistinguishable from outside, the same way `login` refuses to say whether
 * an email is registered.
 *
 * There is no membership check here. There cannot be — the request carries no
 * user. The token *is* the check: it is minted only in a response whose
 * membership was already verified. See lib/attachment-token.ts for what that
 * costs.
 */
export interface AttachmentFile {
	filePath: string;
	kind: "IMAGE" | "FILE" | "AUDIO";
	mediaType: string;
	fileName: string | null;
}

export async function getAttachmentFile(attachmentId: string, token: string, size?: "thumb"): Promise<AttachmentFile> {
	if (!isValidAttachmentToken(token, attachmentId)) throw new NotFoundError("Attachment not found");

	// Checked before the disk, so a file left behind by a failed write is not
	// served as though it were a real attachment.
	const attachment = await prisma.attachment.findUnique({
		where: { id: attachmentId },
		select: { id: true, kind: true, mediaType: true, fileName: true, hasThumbnail: true },
	});
	if (!attachment) throw new NotFoundError("Attachment not found");
	if (size && (attachment.kind !== "IMAGE" || !attachment.hasThumbnail)) {
		throw new NotFoundError("Attachment not found");
	}

	const filePath = await findAttachmentPath(attachmentId, attachment.kind, size === "thumb");
	if (!filePath) throw new NotFoundError("Attachment not found");

	return {
		filePath,
		kind: attachment.kind,
		mediaType: size === "thumb" ? "image/webp" : attachment.mediaType,
		fileName: attachment.fileName,
	};
}

/** Kept as the small service seam used by existing storage tests. */
export async function getAttachmentFilePath(attachmentId: string, token: string): Promise<string> {
	return (await getAttachmentFile(attachmentId, token)).filePath;
}
