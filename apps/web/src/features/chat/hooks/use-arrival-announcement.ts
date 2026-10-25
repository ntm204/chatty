import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { useEffect, useRef, useState } from "react";
import { ARRIVAL_ANNOUNCEMENT_MAX_LENGTH, ARRIVAL_ANNOUNCEMENT_WINDOW_MS } from "../constants/message";
import { getConversationPreview } from "../utils/conversation-preview";
import { resolveDisplayName } from "../utils/resolve-display-name";

interface UseArrivalAnnouncementOptions {
	messages: MessageDTO[];
	currentUserId: string;
	participants: ParticipantDTO[];
}

/**
 * One sentence for a screen reader when someone else's message lands at the end
 * of the open thread.
 *
 * Sighted readers see the bubble appear; without this a screen-reader user at
 * the bottom of the thread heard nothing at all. Only the newest row is
 * announced, never the history, and focus is left alone.
 *
 * Keyed by the message's own `conversationId`, not the prop: switching threads
 * renders once with the previous thread's rows, and the first real row of the
 * new thread must read as a load, not an arrival.
 */
export function useArrivalAnnouncement({
	messages,
	currentUserId,
	participants,
}: UseArrivalAnnouncementOptions): string {
	const [announcement, setAnnouncement] = useState("");
	const previousRef = useRef<{ conversationId: string; messageId: string } | null>(null);
	const latest = messages.at(-1);

	useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = latest ? { conversationId: latest.conversationId, messageId: latest.id } : null;
		if (!latest || !previous || previous.conversationId !== latest.conversationId) {
			setAnnouncement("");

			return;
		}
		if (previous.messageId === latest.id) return;
		if (latest.kind !== "user" || !latest.author || latest.author.id === currentUserId) return;
		if (Date.now() - Date.parse(latest.createdAt) > ARRIVAL_ANNOUNCEMENT_WINDOW_MS) return;

		const preview = getConversationPreview(latest);
		const text =
			preview.length > ARRIVAL_ANNOUNCEMENT_MAX_LENGTH
				? `${preview.slice(0, ARRIVAL_ANNOUNCEMENT_MAX_LENGTH)}…`
				: preview;
		setAnnouncement(`New message from ${resolveDisplayName(participants, latest.author)}: ${text}`);
	}, [latest, currentUserId, participants]);

	return announcement;
}
