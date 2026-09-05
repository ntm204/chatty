import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.js";
import { ValidationError } from "./errors.js";
import { startImageNormalization } from "./metrics.js";
import { signAttachmentToken } from "./attachment-token.js";

/**
 * Where a message's image is — on disk, and on the wire.
 *
 * Deliberately a sibling of avatar-storage.ts rather than a shared "image
 * storage" module. The two answer different questions: an avatar is one square
 * per user, overwritten in place, public, and cached forever; an attachment is
 * one file per message, never replaced, private, and reached through a signed
 * URL. Merging them would mean a function whose every argument decides which of
 * the two it is actually doing.
 */

/**
 * Longest edge, preserving aspect ratio. Enough to stay sharp full-screen on a
 * retina laptop; past it the bytes cost more than the detail is worth in a chat
 * bubble. Smaller images are never enlarged.
 */
const MAX_ATTACHMENT_DIMENSION = 1600;
const MAX_THUMBNAIL_DIMENSION = 480;

/**
 * Same guard as avatars, and for the same reason: a few kilobytes of PNG can
 * decode to gigabytes of pixels, which no file-size limit on the upload can see.
 */
const MAX_INPUT_PIXELS = 50_000_000;

const attachmentsDirectory = path.resolve(env.UPLOAD_DIR, "attachments");

/**
 * Every attachment is re-encoded to WebP on the way in, so the extension is a
 * constant rather than something derived from the upload. Named because the
 * orphan sweep has to take it back off a filename to recover the id.
 */
const IMAGE_FILE_EXTENSION = ".webp";
const FILE_EXTENSION = ".bin";
const THUMBNAIL_SUFFIX = "_t.webp";
const ATTACHMENT_FILE_EXTENSIONS = [IMAGE_FILE_EXTENSION, FILE_EXTENSION] as const;

export type StoredAttachmentKind = "IMAGE" | "FILE" | "AUDIO";

/** What the re-encode produced, for the columns that describe it. */
export interface StoredAttachment {
	width: number;
	height: number;
	byteSize: number;
}

/**
 * Ids reaching this module end up in a path, so the shape is asserted here — at
 * the line that does the joining — rather than trusted to have been checked by
 * whoever called. Same reasoning as avatar-storage.
 */
function assertSafeKey(attachmentId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(attachmentId)) {
		throw new ValidationError("Invalid attachment id");
	}
}

function attachmentPathFor(attachmentId: string, kind: StoredAttachmentKind = "IMAGE"): string {
	assertSafeKey(attachmentId);

	return path.join(
		attachmentsDirectory,
		`${attachmentId}${kind === "IMAGE" ? IMAGE_FILE_EXTENSION : FILE_EXTENSION}`,
	);
}

function thumbnailPathFor(attachmentId: string): string {
	assertSafeKey(attachmentId);

	return path.join(attachmentsDirectory, `${attachmentId}${THUMBNAIL_SUFFIX}`);
}

/**
 * Normalizes an uploaded image and writes it under `attachmentId`.
 *
 * The re-encode is the security control, exactly as it is for avatars: a browser
 * decides what a file is by sniffing its bytes, so storing the original means
 * anything that survives a MIME check can still be served back from this origin
 * as something other than an image. Decoding to pixels and re-encoding as WebP
 * leaves nothing of the input format, and drops the EXIF a phone camera puts
 * there — which for a photo sent into a group chat is a GPS fix.
 *
 * Takes the id rather than inventing one so the caller can write the file
 * *before* the database row exists. Getting that order wrong the other way
 * leaves a row pointing at nothing, which is a message showing a broken image
 * forever; this way a failure leaves an unreferenced file, which costs bytes.
 */
export async function saveAttachment(attachmentId: string, upload: Buffer): Promise<StoredAttachment> {
	const filePath = attachmentPathFor(attachmentId);
	const thumbnailPath = thumbnailPathFor(attachmentId);
	const stopTimer = startImageNormalization(upload.byteLength);

	try {
		let normalized: Buffer;
		let width: number;
		let height: number;
		try {
			const { data, info } = await sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS })
				// Applies the EXIF orientation flag, then discards it — without this,
				// photos taken in portrait arrive sideways.
				.rotate()
				.resize(MAX_ATTACHMENT_DIMENSION, MAX_ATTACHMENT_DIMENSION, {
					fit: "inside",
					withoutEnlargement: true,
				})
				.webp({ quality: 82 })
				.toBuffer({ resolveWithObject: true });
			normalized = data;
			width = info.width;
			height = info.height;
		} catch {
			// sharp throws for anything it cannot decode — a PDF renamed to .png, a
			// truncated upload, a decompression bomb. All the caller's fault, so a 400
			// rather than the 500 an unhandled throw would become.
			throw new ValidationError("That file could not be read as an image");
		}

		await mkdir(attachmentsDirectory, { recursive: true });
		const thumbnail = await sharp(normalized)
			.resize(MAX_THUMBNAIL_DIMENSION, MAX_THUMBNAIL_DIMENSION, { fit: "inside", withoutEnlargement: true })
			.webp({ quality: 70 })
			.toBuffer();
		await Promise.all([writeFile(filePath, normalized), writeFile(thumbnailPath, thumbnail)]);
		stopTimer("success", normalized.byteLength);

		return { width, height, byteSize: normalized.byteLength };
	} catch (error) {
		stopTimer("error");
		throw error;
	}
}

/** Writes bytes that were validated for download, under an opaque server key. */
export async function saveFileAttachment(attachmentId: string, upload: Buffer): Promise<{ byteSize: number }> {
	const filePath = attachmentPathFor(attachmentId, "FILE");

	await mkdir(attachmentsDirectory, { recursive: true });
	await writeFile(filePath, upload);

	return { byteSize: upload.byteLength };
}

/** Absolute path of a stored attachment, or null when the file is not there. */
export async function findAttachmentPath(
	attachmentId: string,
	kind: StoredAttachmentKind = "IMAGE",
	isThumbnail = false,
): Promise<string | null> {
	const filePath =
		isThumbnail && kind === "IMAGE" ? thumbnailPathFor(attachmentId) : attachmentPathFor(attachmentId, kind);

	try {
		await access(filePath);

		return filePath;
	} catch {
		return null;
	}
}

/** Removes an attachment's file. Succeeds when there was nothing to remove. */
export async function deleteAttachment(attachmentId: string): Promise<void> {
	await Promise.all([
		rm(attachmentPathFor(attachmentId, "IMAGE"), { force: true }),
		rm(attachmentPathFor(attachmentId, "FILE"), { force: true }),
		rm(thumbnailPathFor(attachmentId), { force: true }),
	]);
}

/** One stored file, as the orphan sweep needs to see it. */
export interface StoredAttachmentFile {
	/** The id the filename is built from — what an `Attachment` row would be keyed by. */
	id: string;
	/** When it was written. The sweep needs an age, not a name, to be safe. */
	modifiedAt: Date;
}

/**
 * Every attachment file on disk, with its age.
 *
 * Here rather than in the sweep that uses it, because this is the only module
 * that knows attachments are `<id>.webp` files under one directory — and keeping
 * that true is what makes moving them to object storage a change to this file
 * and nothing else. The sweep does the part this module must not do: ask the
 * database which of them are still referenced.
 *
 * A missing directory is an empty list rather than an error. Nothing has been
 * uploaded yet on a fresh install, and a sweep that crashes the timer on that is
 * a sweep that never runs on a quiet deployment.
 */
export async function listStoredAttachments(): Promise<StoredAttachmentFile[]> {
	let entries: string[];
	try {
		entries = await readdir(attachmentsDirectory);
	} catch {
		return [];
	}

	const primaryEntries = entries.filter((entry) => !entry.endsWith(THUMBNAIL_SUFFIX));
	const files = await Promise.all(
		primaryEntries
			.map((entry) => {
				const extension = ATTACHMENT_FILE_EXTENSIONS.find((candidate) => entry.endsWith(candidate));

				return extension ? { entry, id: entry.slice(0, -extension.length) } : null;
			})
			.filter((entry): entry is { entry: string; id: string } => entry !== null)
			.map(async ({ entry, id }) => {
				try {
					const stats = await stat(path.join(attachmentsDirectory, entry));

					return { id, modifiedAt: stats.mtime };
				} catch {
					// Deleted between the listing and the stat — by a message delete, or
					// by another instance's sweep. Not there is the outcome the caller
					// wanted anyway.
					return null;
				}
			}),
	);

	// A healthy id has one primary file, but a crashed migration or a failed
	// write can briefly leave both extensions behind. Report the id once so the
	// sweep deletes/counts it once, and use the newest timestamp so one fresh
	// sibling keeps the whole id inside the grace period.
	const byId = new Map<string, StoredAttachmentFile>();
	for (const file of files) {
		if (!file) continue;
		const current = byId.get(file.id);
		if (!current || file.modifiedAt > current.modifiedAt) byId.set(file.id, file);
	}

	return [...byId.values()];
}

/**
 * The URL a client should put in an `<img src>`.
 *
 * Absolute, because the web app is served from a different origin in dev and a
 * relative path would resolve against Vite rather than this API.
 *
 * The token is minted per response rather than stored, so the same attachment
 * gets a different URL each time the message list is fetched. That costs the
 * HTTP cache — a reload re-downloads every visible image — and it is the price
 * of not leaving a permanent public link to private content lying around. The
 * avatar endpoint makes the opposite trade for the opposite reason: a profile
 * picture is public, so it can be cached forever.
 */
export function buildAttachmentUrl(attachmentId: string, size?: "thumb"): string {
	const params = new URLSearchParams({ token: signAttachmentToken(attachmentId) });
	if (size) params.set("size", size);

	return `${env.PUBLIC_URL}/attachments/${attachmentId}?${params.toString()}`;
}

/** The full-size and thumbnail URLs of one attachment, sharing one signature. */
export interface AttachmentUrls {
	url: string;
	/** Null when the attachment has no thumbnail — a file, a voice note, an image too small to need one. */
	thumbUrl: string | null;
}

/**
 * Sign once for both representations of the same attachment. For ten images
 * with thumbnails this reduces signing operations from twenty to ten.
 * Both URLs still contain the token, so the serialized payload is not smaller.
 * The token authorizes the attachment regardless of size; scope and expiry stay
 * unchanged. Reply quotes use buildAttachmentUrl because they need only one URL.
 */
export function buildAttachmentUrls(attachmentId: string, hasThumbnail: boolean): AttachmentUrls {
	const token = signAttachmentToken(attachmentId);
	const base = `${env.PUBLIC_URL}/attachments/${attachmentId}?${new URLSearchParams({ token }).toString()}`;

	return { url: base, thumbUrl: hasThumbnail ? `${base}&size=thumb` : null };
}

/**
 * The same scheme for a sticker, pointing at the route that actually serves one.
 *
 * Its own function rather than a second call to `buildAttachmentUrl`, which is
 * what this shipped as at first: the token was right, the *path* was not, and
 * every sticker in the tray rendered as a broken image because
 * `/attachments/:id` looks the id up in a table stickers are not in. The unit
 * test asserted the token and never the path, which is exactly the gap running
 * the app closed.
 */
export function buildStickerUrl(stickerId: string): string {
	return `${env.PUBLIC_URL}/stickers/${stickerId}?token=${signAttachmentToken(stickerId)}`;
}
