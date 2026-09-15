import { isOfflineMediaUrl } from "@/utils/is-offline-media-url";
import type { AttachmentDTO } from "@chatty/shared-types";

/**
 * Saves an attachment to the reader's machine.
 *
 * **The obvious version does not work here.** `<a download>` is honoured only
 * for a same-origin href, and the API is a different origin from the web app in
 * every environment this project has — so the anchor would navigate to the
 * picture instead of saving it, replacing the conversation with a full-screen
 * image and no way back but the back button.
 *
 * Fetching the bytes and pointing the anchor at a `blob:` URL of our own origin
 * is what puts the attribute back in force. The fetch itself is allowed because
 * the attachment URL carries its own signed token — see `AttachmentDTO.url` —
 * and the API sends CORS headers for the web app's origin.
 */
export async function downloadAttachment(attachment: AttachmentDTO): Promise<void> {
	if (isOfflineMediaUrl(attachment.url)) throw new Error("Connect to download the original attachment.");
	const response = await fetch(attachment.url);
	if (!response.ok) throw new Error(`The attachment could not be fetched (${response.status})`);

	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");

	// An image has no file name of its own — the server re-encodes what it is
	// given — so the id plus the real subtype is the only honest name available,
	// and it is at least unique in a downloads folder.
	link.href = objectUrl;
	link.download = attachment.fileName ?? `${attachment.id}.${attachment.mediaType.split("/").at(-1)}`;
	document.body.append(link);
	link.click();
	link.remove();

	// Released on the next task rather than immediately: a blob URL revoked in
	// the same task as the click that consumed it cancels the download it was
	// for, and it does so only in some browsers, which is the worst kind of bug
	// to ship.
	setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
