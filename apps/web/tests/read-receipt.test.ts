import { describe, expect, it } from "vitest";
import { getReadReceipt } from "@/features/chat/thread/utils/read-receipt";
import { makeMessage, makeParticipant } from "./factories";

const messages = [
	makeMessage("m1", "minh", "hello"),
	makeMessage("m2", "an", "hi"),
	makeMessage("m3", "minh", "how are you"),
	makeMessage("m4", "minh", "still there?"),
];

describe("getReadReceipt", () => {
	it("returns nothing when the other person has read nothing", () => {
		const participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An", null)];

		expect(getReadReceipt(messages, participants, "minh", true)).toBeNull();
	});

	it("puts the receipt on your newest message the other person has reached", () => {
		const participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An", "m3")];

		expect(getReadReceipt(messages, participants, "minh", true)).toEqual({
			messageId: "m3",
			readerCount: 1,
			readerIds: ["an"],
		});
	});

	it("walks back to your message when the marker sits on someone else's", () => {
		// An's marker is on their own message; the newest thing of yours they have
		// seen is the one before it.
		const participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An", "m2")];

		expect(getReadReceipt(messages, participants, "minh", true)).toEqual({
			messageId: "m1",
			readerCount: 1,
			readerIds: ["an"],
		});
	});

	it("ignores your own marker, so reading your own messages is not a receipt", () => {
		const participants = [makeParticipant("minh", "Minh", "m4"), makeParticipant("an", "An", null)];

		expect(getReadReceipt(messages, participants, "minh", true)).toBeNull();
	});

	it("reports the receipt at the furthest reader and counts only those who reached it", () => {
		const participants = [
			makeParticipant("minh", "Minh"),
			makeParticipant("an", "An", "m4"),
			makeParticipant("binh", "Binh", "m1"),
		];

		// Binh stopped at m1, so they are not among the readers of m4.
		expect(getReadReceipt(messages, participants, "minh", true)).toEqual({
			messageId: "m4",
			readerCount: 1,
			readerIds: ["an"],
		});
	});

	it("counts everyone who has reached the same message", () => {
		const participants = [
			makeParticipant("minh", "Minh"),
			makeParticipant("an", "An", "m4"),
			makeParticipant("binh", "Binh", "m4"),
		];

		expect(getReadReceipt(messages, participants, "minh", true)).toEqual({
			messageId: "m4",
			readerCount: 2,
			readerIds: ["an", "binh"],
		});
	});

	it("shows nothing to a viewer who has turned their own receipts off", () => {
		// The symmetric half of the setting, and the only half the client owns: the
		// other person is sharing, and this viewer still does not get to see it,
		// because they stopped sharing theirs.
		const participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An", "m3")];

		expect(getReadReceipt(messages, participants, "minh", false)).toBeNull();
	});

	it("returns nothing when the marker points outside the loaded page", () => {
		// Claiming a receipt here would mean guessing that an unseen id must be
		// older, and asserting messages were read that may not have been.
		const participants = [makeParticipant("minh", "Minh"), makeParticipant("an", "An", "m-from-an-older-page")];

		expect(getReadReceipt(messages, participants, "minh", true)).toBeNull();
	});
});
