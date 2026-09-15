import { OFFLINE_BINARY_URL, OFFLINE_IMAGE_URL } from "@/constants/offline-media";

export function isOfflineMediaUrl(url: string): boolean {
	return url === OFFLINE_BINARY_URL || url === OFFLINE_IMAGE_URL;
}
