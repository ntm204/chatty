import { expect, it } from "vitest";
import { applyMessageRetractions, applyMessageUpdate } from "@/utils/apply-message-update";
import { makeMessage } from "./factories";

it("retracts an embedded quote even when the original is outside loaded history", () => {
	const reply = {
		...makeMessage("reply", "an", "answer"),
		replyTo: {
			id: "original",
			content: "private original",
			authorName: "Minh",
			hasAttachment: true,
			attachmentUrl: "https://example.test/private.jpg",
			isDeleted: false,
		},
	};
	const deleted = { ...makeMessage("original", "minh", ""), deletedAt: new Date().toISOString() };
	expect(applyMessageUpdate(reply, deleted)).toMatchObject({
		content: "answer",
		replyTo: {
			content: "",
			hasAttachment: false,
			attachmentUrl: null,
			isDeleted: true,
		},
	});
	const unrelated = makeMessage("unrelated", "an", "keep identity");
	expect(applyMessageUpdate(unrelated, deleted)).toBe(unrelated);
});

it("keeps an observed retraction over stale paging and retracts cached reply text", () => {
	const original = makeMessage("original", "an", "private original");
	const tombstone = { ...original, content: "", deletedAt: new Date().toISOString() };
	const known = new Map([[original.id, tombstone]]);
	const reply = {
		...makeMessage("reply", "minh", "answer"),
		replyTo: {
			id: original.id,
			authorName: "An",
			content: "private original",
			hasAttachment: false,
			attachmentUrl: null,
			isDeleted: false,
		},
	};
	const page = applyMessageRetractions([original, reply], known);
	expect(page[0]?.content).toBe("");
	expect(page[1]?.replyTo).toMatchObject({ content: "", isDeleted: true });
});
