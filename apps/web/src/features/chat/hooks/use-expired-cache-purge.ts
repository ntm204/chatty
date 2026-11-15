import { useEffect } from "react";
import { purgeExpiredMessages } from "@/lib/local-chat-store";

/** Clears expired messages from this device's cache once per signed-in session. See `purgeExpiredMessages`. */
export function useExpiredCachePurge(userId: string | undefined): void {
	useEffect(() => {
		if (userId) void purgeExpiredMessages(userId).catch(() => undefined);
	}, [userId]);
}
