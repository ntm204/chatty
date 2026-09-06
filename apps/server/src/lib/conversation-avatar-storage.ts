import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { normalizeAvatarImage } from "./avatar-storage.js";
import { ValidationError } from "./errors.js";

/**
 * A group's own photo — same shape and storage scheme as a user avatar
 * (see avatar-storage.ts), under its own directory and URL. See ADR 0022.
 */

const conversationAvatarsDirectory = path.resolve(env.UPLOAD_DIR, "conversation-avatars");
const AVATAR_FILE_EXTENSION = ".webp";

function assertSafeKey(conversationId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(conversationId)) {
		throw new ValidationError("Invalid conversation id");
	}
}

function avatarPathFor(conversationId: string): string {
	assertSafeKey(conversationId);

	return path.join(conversationAvatarsDirectory, `${conversationId}${AVATAR_FILE_EXTENSION}`);
}

export async function saveConversationAvatar(conversationId: string, upload: Buffer): Promise<void> {
	const filePath = avatarPathFor(conversationId);
	const normalized = await normalizeAvatarImage(upload);

	await mkdir(conversationAvatarsDirectory, { recursive: true });
	await writeFile(filePath, normalized);
}

/** Absolute path of a stored group photo, or null when there isn't one on disk. */
export async function findConversationAvatarPath(conversationId: string): Promise<string | null> {
	const filePath = avatarPathFor(conversationId);

	try {
		await access(filePath);

		return filePath;
	} catch {
		return null;
	}
}

/** Removes a group's photo. Succeeds when there was nothing to remove. */
export async function deleteConversationAvatar(conversationId: string): Promise<void> {
	await rm(avatarPathFor(conversationId), { force: true });
}

/** Same `?v=` cache-busting scheme as `buildAvatarUrl` — see that function's comment. */
export function buildConversationAvatarUrl(conversationId: string, avatarUpdatedAt: Date | null): string | null {
	if (!avatarUpdatedAt) return null;

	return `${env.PUBLIC_URL}/conversations/${conversationId}/avatar?v=${avatarUpdatedAt.getTime()}`;
}
