import { describe, expect, it } from "vitest";
import { getConversationPresence } from "@/features/chat/utils/conversation-presence";
import { makeConversation, makeParticipant } from "./factories";

const minh = makeParticipant("minh", "Minh");
const an = makeParticipant("an", "An");
const binh = makeParticipant("binh", "Binh");

const direct = makeConversation({ participants: [minh, an] });
const group = makeConversation({ isGroup: true, name: "Team", participants: [minh, an, binh] });

describe("getConversationPresence", () => {
	it("says Online for a peer in the online set", () => {
		const presence = getConversationPresence(direct, "minh", new Set(["an"]));

		expect(presence.peer?.id).toBe("an");
		expect(presence.isPeerOnline).toBe(true);
		expect(presence.peerStatus).toBe("Online");
	});

	it("has no status line when the peer has last-seen turned off", () => {
		// The header drops the line rather than printing a non-answer.
		const presence = getConversationPresence(direct, "minh", new Set());

		expect(presence.isPeerOnline).toBe(false);
		expect(presence.peerStatus).toBeNull();
	});

	it("reports the last seen time when there is one", () => {
		const seenPeer = { ...an, lastSeenAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
		const conversation = makeConversation({ participants: [minh, seenPeer] });
		const presence = getConversationPresence(conversation, "minh", new Set());

		expect(presence.peerStatus?.toLowerCase()).toContain("last seen");
	});

	it("has no peer in a group, and counts who is online instead", () => {
		const presence = getConversationPresence(group, "minh", new Set(["an", "binh"]));

		expect(presence.peer).toBeNull();
		expect(presence.isPeerOnline).toBe(false);
		expect(presence.onlineCount).toBe(2);
	});

	it("counts the viewer's own presence, because the header's total includes them", () => {
		const presence = getConversationPresence(group, "minh", new Set(["minh"]));

		expect(presence.onlineCount).toBe(1);
	});
});
