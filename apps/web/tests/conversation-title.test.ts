import { describe, expect, it } from "vitest";
import { getConversationTitle } from "@/features/chat/utils/conversation-title";
import { makeConversation, makeParticipant } from "./factories";

describe("getConversationTitle", () => {
	it("titles a direct conversation with the other person, not yourself", () => {
		const conversation = makeConversation({
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		});

		expect(getConversationTitle(conversation, "minh")).toBe("An");
	});

	it("gives each viewer a different title for the same direct conversation", () => {
		// This is why the title cannot be computed once on the server.
		const conversation = makeConversation({
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		});

		expect(getConversationTitle(conversation, "minh")).toBe("An");
		expect(getConversationTitle(conversation, "an")).toBe("Minh");
	});

	it("uses the stored name for a group", () => {
		const conversation = makeConversation({
			isGroup: true,
			name: "Weekend football",
			participants: [
				makeParticipant("minh", "Minh"),
				makeParticipant("an", "An"),
				makeParticipant("binh", "Binh"),
			],
		});

		expect(getConversationTitle(conversation, "minh")).toBe("Weekend football");
	});

	it("falls back to 'Group' for an unnamed group", () => {
		// The server allows a group with no name, so the UI must not render "null".
		const conversation = makeConversation({
			isGroup: true,
			name: null,
			participants: [
				makeParticipant("minh", "Minh"),
				makeParticipant("an", "An"),
				makeParticipant("binh", "Binh"),
			],
		});

		expect(getConversationTitle(conversation, "minh")).toBe("Group");
	});

	it("falls back to 'Unknown' when the conversation has no participants", () => {
		const conversation = makeConversation({ participants: [] });

		expect(getConversationTitle(conversation, "minh")).toBe("Unknown");
	});

	it("titles a conversation with only yourself as 'Saved messages'", () => {
		const conversation = makeConversation({ participants: [makeParticipant("minh", "Minh")] });

		expect(getConversationTitle(conversation, "minh")).toBe("Saved messages");
	});
});
