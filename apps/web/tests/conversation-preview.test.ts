import { describe, expect, it } from "vitest";
import { getConversationPreview } from "@/features/chat/utils/conversation-preview";
import { makeAttachment, makeMessage, makeSystemMessage } from "./factories";

const DELETED_AT = "2026-08-23T10:06:00.000Z";

describe("getConversationPreview", () => {
	it("says so when nothing has been sent yet", () => {
		expect(getConversationPreview(null)).toBe("No messages yet");
	});

	it("shows the text of an ordinary message", () => {
		expect(getConversationPreview(makeMessage("m1", "an", "see you at six"))).toBe("see you at six");
	});

	it("describes a picture that came with no caption", () => {
		// Otherwise the row renders an empty line, which reads as a conversation
		// with nothing in it — the one thing it is definitely not.
		expect(getConversationPreview(makeMessage("m1", "an", "", [makeAttachment()]))).toBe("Sent an image");
	});

	it("prefers the caption when a picture has one", () => {
		expect(getConversationPreview(makeMessage("m1", "an", "look", [makeAttachment()]))).toBe("look");
	});

	it("identifies a voice message instead of calling it an image", () => {
		const message = makeMessage("m1", "an", "", [makeAttachment({ kind: "audio" })]);

		expect(getConversationPreview(message)).toBe("Voice message");
	});

	it("identifies a standalone file instead of calling it an image", () => {
		const message = makeMessage("m1", "an", "", [makeAttachment({ kind: "file" })]);

		expect(getConversationPreview(message)).toBe("Sent a file");
	});

	it("uses the thread's own sentence for a message that was unsent", () => {
		// The server empties `content` on delete, so without this the sidebar
		// would show a blank row for a conversation that still has history.
		const tombstone = makeMessage("m1", "an", "", [makeAttachment()], { deletedAt: DELETED_AT });

		expect(getConversationPreview(tombstone)).toBe("This message was deleted");
	});

	it("shows a group event as itself", () => {
		expect(getConversationPreview(makeSystemMessage("s1", "An added Binh"))).toBe("An added Binh");
	});
});
