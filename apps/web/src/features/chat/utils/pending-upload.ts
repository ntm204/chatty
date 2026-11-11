import type { PendingUpload } from "../types/conversation-messages";
import { optimizeImagesForUpload } from "./optimize-image-upload";

// Optimization can fail while IndexedDB is still committing the original bytes.
// Attach a handler immediately; deliver still receives the original rejection.
export function prepareImageFiles(files: File[]): Promise<File[]> {
	const prepared = optimizeImagesForUpload(files);
	void prepared.catch(() => undefined);

	return prepared;
}

/**
 * Hands back one draft's object URLs, and forgets its files.
 *
 * Every `blob:` URL pins its file in memory until it is revoked or the document
 * goes; a tab left open on a busy conversation would accumulate every picture
 * ever sent from it. Safe to call twice and safe to call for an id that was
 * never registered, which is what lets every exit from a send call it without
 * first working out which kind of send it was.
 */
export function releaseUpload(pending: Map<string, PendingUpload>, draftId: string): void {
	const upload = pending.get(draftId);
	if (!upload) return;

	for (const url of upload.urls) URL.revokeObjectURL(url);
	pending.delete(draftId);
}
