import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.js";
import { ValidationError } from "./errors.js";

/**
 * Where an avatar is — on disk, and on the wire.
 *
 * Both answers live here because both are derived from the same key, and every
 * service that returns a user needs the URL. It knows nothing about requests or
 * the database, which is what makes the S3 swap in phase 5 a change to this
 * file and nothing else.
 */

/**
 * One size, re-encoded on upload. Chat shows avatars at 32-44px, so 256 covers
 * retina and any future profile view without keeping the original around.
 */
const AVATAR_SIZE = 256;

/**
 * Refuses images that decode to more pixels than this, regardless of file size.
 *
 * A few kilobytes of PNG can expand to gigabytes in memory — the file-size limit
 * on the upload middleware does not catch that, because the bomb is small on
 * disk. 50MP is well past any phone camera.
 */
const MAX_INPUT_PIXELS = 50_000_000;

const avatarsDirectory = path.resolve(env.UPLOAD_DIR, "avatars");
const AVATAR_FILE_EXTENSION = ".webp";

/**
 * Ids reaching this module come from route params, and a path is built from
 * them. `../` in that string would write outside the upload directory, so the
 * shape is asserted here — at the line that does the joining — rather than
 * trusted to have been checked by whoever called.
 */
function assertSafeKey(userId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
		throw new ValidationError("Invalid user id");
	}
}

function avatarPathFor(userId: string): string {
	assertSafeKey(userId);

	return path.join(avatarsDirectory, `${userId}${AVATAR_FILE_EXTENSION}`);
}

/**
 * Normalizes an uploaded image into avatar shape: same size, same format,
 * nothing of the input left in it.
 *
 * The re-encode is the security control, not a nicety. A browser decides what a
 * file is by sniffing its bytes, not by the extension or the Content-Type the
 * uploader claimed, so storing the original means anything that survives a MIME
 * check can still be served back from this origin as something else. Decoding
 * to raw pixels and re-encoding as WebP leaves nothing of the input format.
 *
 * It also drops metadata — sharp does unless asked otherwise — so an avatar
 * cannot publish the GPS coordinates the phone put in the EXIF.
 *
 * Shared by user avatars and, since ADR 0022, group photos — the same shape,
 * the same security control, so this is the one place either caller trusts to
 * get it right.
 */
export async function normalizeAvatarImage(upload: Buffer): Promise<Buffer> {
	try {
		return await sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS })
			// Applies the EXIF orientation flag, then discards it. Without this,
			// photos taken in portrait arrive sideways.
			.rotate()
			.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
			.webp({ quality: 82 })
			.toBuffer();
	} catch {
		// sharp throws for anything it cannot decode — a PDF renamed to .png, a
		// truncated upload, a decompression bomb. All of them are the caller's
		// fault, so this is a 400 rather than the 500 an unhandled throw would be.
		throw new ValidationError("That file could not be read as an image");
	}
}

/**
 * Overwrites in place under one key per user. Writing a new filename each time
 * would leave every previous picture on disk forever; the cache is busted by
 * `avatarUpdatedAt` in the URL instead.
 */
export async function saveAvatar(userId: string, upload: Buffer): Promise<void> {
	const filePath = avatarPathFor(userId);
	const normalized = await normalizeAvatarImage(upload);

	await mkdir(avatarsDirectory, { recursive: true });
	await writeFile(filePath, normalized);
}

/** Absolute path of a stored avatar, or null when the user has none on disk. */
export async function findAvatarPath(userId: string): Promise<string | null> {
	const filePath = avatarPathFor(userId);

	try {
		await access(filePath);

		return filePath;
	} catch {
		return null;
	}
}

/** Removes a user's avatar. Succeeds when there was nothing to remove. */
export async function deleteAvatar(userId: string): Promise<void> {
	await rm(avatarPathFor(userId), { force: true });
}

export interface StoredAvatarFile {
	userId: string;
	modifiedAt: Date;
}

/** Lists avatar files without assuming every file still has a user row. */
export async function listStoredAvatars(): Promise<StoredAvatarFile[]> {
	let entries: string[];
	try {
		entries = await readdir(avatarsDirectory);
	} catch {
		return [];
	}

	const files = await Promise.all(
		entries
			.filter((entry) => entry.endsWith(AVATAR_FILE_EXTENSION))
			.map(async (entry) => {
				try {
					const stats = await stat(path.join(avatarsDirectory, entry));

					return { userId: entry.slice(0, -AVATAR_FILE_EXTENSION.length), modifiedAt: stats.mtime };
				} catch {
					return null;
				}
			}),
	);

	return files.filter((file): file is StoredAvatarFile => file !== null);
}

/**
 * The URL a client should put in an `<img src>`, or null when there is no picture.
 *
 * Absolute, because the web app is served from a different origin in dev and a
 * relative path would resolve against Vite rather than this API.
 *
 * The `v` is what makes an avatar both cacheable and current. Browsers cache
 * images hard; without a value that changes on upload, a user who replaces
 * their picture keeps seeing the old one — for everyone else, possibly for
 * days. Mattermost solves it with `last_picture_update` and Rocket.Chat with an
 * etag param; this is the same trick.
 */
export function buildAvatarUrl(userId: string, avatarUpdatedAt: Date | null): string | null {
	if (!avatarUpdatedAt) return null;

	return `${env.PUBLIC_URL}/users/${userId}/avatar?v=${avatarUpdatedAt.getTime()}`;
}
