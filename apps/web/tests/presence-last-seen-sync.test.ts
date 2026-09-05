import type { ConversationDTO, PresenceEvent } from "@chatty/shared-types";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePresenceLastSeenSync } from "@/features/chat/hooks/use-presence-last-seen-sync";
import { makeConversation, makeParticipant } from "./factories";

const socket = vi.hoisted(() => ({ handler: undefined as ((event: PresenceEvent) => void) | undefined }));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (_name: string, handler: (event: PresenceEvent) => void) => {
		socket.handler = handler;
	},
}));

function renderPresence() {
	const initial = [
		makeConversation({ id: "first", participants: [makeParticipant("an", "An")] }),
		makeConversation({ id: "second", participants: [makeParticipant("binh", "Binh")] }),
	];
	const view = renderHook(() => {
		const [conversations, setConversations] = useState<ConversationDTO[]>(initial);
		usePresenceLastSeenSync(setConversations);

		return conversations;
	});

	return { ...view, initial };
}

function emit(userId: string, lastSeenAt: string | null, isOnline = false) {
	act(() => socket.handler?.({ userId, lastSeenAt, isOnline }));
}

beforeEach(() => {
	socket.handler = undefined;
});

describe("presence last-seen synchronization", () => {
	it("keeps the open thread's props when another conversation's participant goes offline", () => {
		const { result, initial } = renderPresence();
		emit("binh", "2026-09-05T01:00:00.000Z");

		expect(result.current[0]).toBe(initial[0]);
		expect(result.current[0]!.participants).toBe(initial[0]!.participants);
		expect(result.current[1]!.participants[0]!.lastSeenAt).toBe("2026-09-05T01:00:00.000Z");
		expect(initial[1]!.participants[0]!.lastSeenAt).toBeNull();
	});

	it("preserves the entire state for an unrelated user or a duplicate event", () => {
		const { result, initial } = renderPresence();
		emit("unknown", "2026-09-05T01:00:00.000Z");
		expect(result.current).toBe(initial);
		emit("an", null);
		expect(result.current).toBe(initial);
	});

	it("withdraws a timestamp when privacy changes send null", () => {
		const { result } = renderPresence();
		emit("an", "2026-09-05T01:00:00.000Z");
		expect(result.current[0]!.participants[0]!.lastSeenAt).not.toBeNull();
		emit("an", null);
		expect(result.current[0]!.participants[0]!.lastSeenAt).toBeNull();
	});

	it("leaves last-seen state alone for online events", () => {
		const { result, initial } = renderPresence();
		emit("an", "2026-09-05T01:00:00.000Z", true);
		expect(result.current).toBe(initial);
	});
});
