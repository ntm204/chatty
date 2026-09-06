import type { MessageDTO, PresenceEvent, TypingEvent } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { TYPING_EXPIRY_MS } from "../constants/typing";
import { useSocketEvent } from "./use-socket-event";

/**
 * Who is currently typing, both in the open thread and in each sidebar row.
 *
 * Every typer carries an expiry timer, because a "stopped typing" message is
 * not guaranteed to arrive — the sender may close their laptop mid-sentence.
 * Without the timer the indicator would stay lit until the page reloaded.
 *
 * Timers rather than a polling interval: an interval would tick for the whole
 * session to catch an event that happens rarely, while a timer only exists
 * while someone is actually typing.
 */
export function useTypingParticipants(conversationId: string | null): {
	activeUserIds: string[];
	typingByConversation: Record<string, string[]>;
} {
	const [typingByConversation, setTypingByConversation] = useState<Record<string, string[]>>({});
	const expiryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const forgetTyper = useCallback((targetConversationId: string, userId: string) => {
		const key = `${targetConversationId}:${userId}`;
		const timer = expiryTimers.current.get(key);
		if (timer) clearTimeout(timer);

		expiryTimers.current.delete(key);
		setTypingByConversation((current) => {
			const nextIds = (current[targetConversationId] ?? []).filter((typingUserId) => typingUserId !== userId);
			if (nextIds.length > 0) return { ...current, [targetConversationId]: nextIds };
			const rest = { ...current };
			delete rest[targetConversationId];

			return rest;
		});
	}, []);

	useSocketEvent(
		"typing:update",
		useCallback(
			(event: TypingEvent) => {
				if (!event.isTyping) {
					forgetTyper(event.conversationId, event.userId);

					return;
				}

				const key = `${event.conversationId}:${event.userId}`;
				const existingTimer = expiryTimers.current.get(key);
				if (existingTimer) clearTimeout(existingTimer);
				expiryTimers.current.set(
					key,
					setTimeout(() => forgetTyper(event.conversationId, event.userId), TYPING_EXPIRY_MS),
				);

				setTypingByConversation((current) => {
					const ids = current[event.conversationId] ?? [];

					return ids.includes(event.userId)
						? current
						: { ...current, [event.conversationId]: [...ids, event.userId] };
				});
			},
			[forgetTyper],
		),
	);

	useEffect(() => {
		const timers = expiryTimers.current;
		const socket = getSocket();
		const clearTyping = () => {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			setTypingByConversation({});
		};
		socket.on("disconnect", clearTyping);

		return () => {
			socket.off("disconnect", clearTyping);
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		};
	}, []);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (message.author) forgetTyper(message.conversationId, message.author.id);
			},
			[forgetTyper],
		),
	);

	useSocketEvent(
		"presence:update",
		useCallback(
			(event: PresenceEvent) => {
				if (event.isOnline) return;
				for (const targetConversationId of Object.keys(typingByConversation)) {
					if (typingByConversation[targetConversationId]?.includes(event.userId)) {
						forgetTyper(targetConversationId, event.userId);
					}
				}
			},
			[forgetTyper, typingByConversation],
		),
	);

	return { activeUserIds: conversationId ? (typingByConversation[conversationId] ?? []) : [], typingByConversation };
}
