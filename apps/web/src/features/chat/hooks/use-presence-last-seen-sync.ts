import type { ConversationDTO, PresenceEvent } from "@chatty/shared-types";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useSocketEvent } from "./use-socket-event";

export function usePresenceLastSeenSync(setConversations: Dispatch<SetStateAction<ConversationDTO[]>>): void {
	useSocketEvent(
		"presence:update",
		useCallback(
			(event: PresenceEvent) => {
				// `null` is meaningful: a privacy change (including a direct block)
				// withdraws a timestamp already rendered on another open device.
				if (event.isOnline) return;
				setConversations((current) => {
					let hasChanges = false;
					const next = current.map((conversation) => {
						const hasChangedParticipant = conversation.participants.some(
							(participant) =>
								participant.id === event.userId && participant.lastSeenAt !== event.lastSeenAt,
						);
						// Preserve props of the memoised thread when another conversation changes.
						if (!hasChangedParticipant) return conversation;
						hasChanges = true;

						return {
							...conversation,
							participants: conversation.participants.map((participant) =>
								participant.id === event.userId
									? { ...participant, lastSeenAt: event.lastSeenAt }
									: participant,
							),
						};
					});

					return hasChanges ? next : current;
				});
			},
			[setConversations],
		),
	);
}
