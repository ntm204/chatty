import type { ConversationDTO, RestrictionChangedEvent } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { api } from "@/api/client";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { getDirectPeer } from "../utils/direct-peer";
import { useSocketEvent } from "./use-socket-event";

/**
 * Re-reads a direct conversation's badge whenever its peer's restriction flips.
 *
 * The server decides which messages a restriction hides from the count, and a
 * live `message:new` alone cannot reproduce that for messages already counted
 * before the flip — restricting on a phone has to dim the laptop's badge, and
 * unrestricting has to bring back what was hidden. Asking for the one row keeps
 * the badge equal to what a reload would show instead of guessing it locally.
 *
 * Two triggers, because neither covers the other: `restriction:changed` reaches
 * every session of the actor (including a tab that never resolved this peer, so
 * its store sees no difference on an unrestrict), and a first lookup resolving to
 * "restricted" corrects a badge `message:new` raised while the status was unknown.
 */
export function useRestrictedUnreadSync(
	currentUserId: string | undefined,
	conversations: ConversationDTO[],
	setConversations: Dispatch<SetStateAction<ConversationDTO[]>>,
): void {
	const conversationsRef = useRef(conversations);
	conversationsRef.current = conversations;
	const isActiveRef = useRef(true);

	const rereadDirectBadges = useCallback(
		(peerIds: Set<string>) => {
			if (!currentUserId || peerIds.size === 0) return;
			for (const conversation of conversationsRef.current) {
				const peer = getDirectPeer(conversation, currentUserId);
				if (!peer || !peerIds.has(peer.id)) continue;
				void api
					.getConversation(conversation.id)
					.then((row) => {
						if (!isActiveRef.current) return;
						setConversations((current) =>
							current.map((existing) =>
								existing.id === row.id ? { ...existing, unreadCount: row.unreadCount } : existing,
							),
						);
					})
					.catch(() => undefined);
			}
		},
		[currentUserId, setConversations],
	);

	useSocketEvent(
		"restriction:changed",
		useCallback(
			(event: RestrictionChangedEvent) => rereadDirectBadges(new Set([event.userId])),
			[rereadDirectBadges],
		),
	);

	useEffect(() => {
		isActiveRef.current = true;
		const unsubscribe = useRestrictedUsers.subscribe((state, previous) => {
			if (state.restrictedIds === previous.restrictedIds) return;
			const firstResolvedAsRestricted = [...state.restrictedIds].filter((id) => !previous.checkedIds.has(id));
			rereadDirectBadges(new Set(firstResolvedAsRestricted));
		});

		return () => {
			isActiveRef.current = false;
			unsubscribe();
		};
	}, [rereadDirectBadges]);
}
