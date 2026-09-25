import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storage from "../src/lib/attachment-storage.js";
import { NotFoundError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { createConversation, removeParticipant } from "../src/modules/conversations/conversations.service.js";
import {
	deleteMessage,
	editMessage,
	hideMessageForUser,
	sendMessage,
} from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;
const preparedIds: string[] = [];

beforeEach(() => {
	fakeIO = installFakeIO();
	preparedIds.length = 0;
});

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(preparedIds.map((id) => storage.deleteAttachment(id)));
});

async function fixture() {
	const users = await Promise.all(
		["owner", "sender", "reader"].map((name) =>
			prisma.user.create({
				data: { email: `${name}@test.local`, handle: name, displayName: name, passwordHash: "unused" },
				select: { id: true },
			}),
		),
	);
	const [owner, sender, reader] = users;
	const sourceConversation = await createConversation(owner!.id, {
		participantIds: [sender!.id, reader!.id],
		name: "Forward source",
	});
	const destination = await createConversation(sender!.id, { participantIds: [reader!.id] });
	const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: "black" } })
		.png()
		.toBuffer();
	const source = await sendMessage(owner!.id, sourceConversation.id, { content: "Original", attachments: [image] });
	preparedIds.push(source.attachments[0]!.id);
	fakeIO.emits.length = 0;

	return { ownerId: owner!.id, senderId: sender!.id, sourceConversation, destination, source };
}

/** Interleave a real source mutation after bytes are copied, before send takes its locks. */
function afterCopy(mutate: () => Promise<unknown>) {
	const save = storage.saveAttachment;

	return vi.spyOn(storage, "saveAttachment").mockImplementationOnce(async (id, buffer) => {
		const result = await save(id, buffer);
		preparedIds.push(id);
		await mutate();

		return result;
	});
}

describe("forward source authority at commit", () => {
	it.each(["retracted", "hidden", "membership removed"] as const)(
		"rejects a source %s while its attachment is being copied and cleans the copy",
		async (change) => {
			const { ownerId, senderId, sourceConversation, destination, source } = await fixture();
			afterCopy(async () => {
				if (change === "retracted") await deleteMessage(ownerId, sourceConversation.id, source.id);
				else if (change === "hidden") await hideMessageForUser(senderId, sourceConversation.id, source.id);
				else await removeParticipant(ownerId, sourceConversation.id, senderId);
			});
			await expect(
				sendMessage(senderId, destination.id, { content: "", forwardOfMessageId: source.id }),
			).rejects.toBeInstanceOf(NotFoundError);
			expect(await prisma.message.count({ where: { conversationId: destination.id } })).toBe(0);
			expect(await storage.findAttachmentPath(preparedIds[1]!)).toBeNull();
			expect(
				fakeIO.emits.filter((entry) => entry.event === "message:new" && entry.room === destination.id),
			).toEqual([]);
		},
	);

	it("forwards the current caption and links when editing commits during attachment preparation", async () => {
		const { ownerId, senderId, sourceConversation, destination, source } = await fixture();
		afterCopy(() =>
			editMessage(ownerId, sourceConversation.id, source.id, { content: "Revised https://example.com/latest" }),
		);
		const sent = await sendMessage(senderId, destination.id, { content: "", forwardOfMessageId: source.id });
		expect(sent.content).toBe("Revised https://example.com/latest");
		expect(sent.attachments).toHaveLength(1);
		expect(await storage.findAttachmentPath(sent.attachments[0]!.id)).not.toBeNull();
		expect(await prisma.messageLink.findMany({ where: { messageId: sent.id }, select: { url: true } })).toEqual([
			{ url: "https://example.com/latest" },
		]);
	});

	it("cleans a copied attachment when its writer fails after creating the file", async () => {
		const { senderId, destination, source } = await fixture();
		const save = storage.saveAttachment;
		let failedId = "";
		vi.spyOn(storage, "saveAttachment").mockImplementationOnce(async (id, buffer) => {
			failedId = id;
			preparedIds.push(id);
			await save(id, buffer);
			throw new Error("simulated write failure");
		});

		await expect(
			sendMessage(senderId, destination.id, { content: "", forwardOfMessageId: source.id }),
		).rejects.toThrow("simulated write failure");
		expect(failedId).not.toBe("");
		expect(await storage.findAttachmentPath(failedId)).toBeNull();
		expect(await prisma.message.count({ where: { conversationId: destination.id } })).toBe(0);
	});

	it("replays an already committed forward after its source is retracted without copying files again", async () => {
		const { ownerId, senderId, sourceConversation, destination, source } = await fixture();
		const input = { content: "", forwardOfMessageId: source.id, clientId: "forward-replay" };
		const sent = await sendMessage(senderId, destination.id, input);
		preparedIds.push(sent.attachments[0]!.id);
		await deleteMessage(ownerId, sourceConversation.id, source.id);
		const copy = vi.spyOn(storage, "saveAttachment");
		const replay = await sendMessage(senderId, destination.id, input);
		expect(replay.id).toBe(sent.id);
		expect(replay.content).toBe("Original");
		expect(copy).not.toHaveBeenCalled();
		expect(await prisma.message.count({ where: { conversationId: destination.id } })).toBe(1);
	});

	it("allows opposite-direction forwards to finish without a deadlock", async () => {
		const { senderId, sourceConversation, destination, source } = await fixture();
		const other = await sendMessage(senderId, destination.id, { content: "Other direction" });
		const results = await Promise.all([
			sendMessage(senderId, destination.id, { content: "", forwardOfMessageId: source.id }),
			sendMessage(senderId, sourceConversation.id, { content: "", forwardOfMessageId: other.id }),
		]);
		preparedIds.push(results[0]!.attachments[0]!.id);
		expect(results.map((message) => message.content)).toEqual(["Original", "Other direction"]);
	});
});
