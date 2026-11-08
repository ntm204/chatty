import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { NotFoundError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { sendMessageSchema } from "../src/modules/messages/messages.schema.js";
import { sendMessage } from "../src/modules/messages/messages.service.js";
import { addSticker, listStickers, removeSticker } from "../src/modules/stickers/stickers.service.js";
import { installFakeIO } from "./fake-io.js";

const UPLOAD_DIR = ".data/test-uploads";

beforeEach(() => {
	installFakeIO();
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

async function makeImage(): Promise<Buffer> {
	return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 5, g: 5, b: 5 } } })
		.png()
		.toBuffer();
}

async function makeConversation(): Promise<{ conversationId: string; authorId: string; outsiderId: string }> {
	const author = await prisma.user.create({
		data: { email: "s1@chatty.test", handle: "s1", displayName: "One", passwordHash: "x" },
		select: { id: true },
	});
	const peer = await prisma.user.create({
		data: { email: "s2@chatty.test", handle: "s2", displayName: "Two", passwordHash: "x" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, outsiderId: peer.id };
}

describe("the sticker tray", () => {
	it("saves an image and lists it back with a signed url", async () => {
		const { authorId } = await makeConversation();

		const saved = await addSticker(authorId, await makeImage());

		expect(await findAttachmentPath(saved.id)).not.toBeNull();
		// The path as well as the token: pointing a signed sticker URL at
		// `/attachments/:id` is a 404 and a broken image in every tray, and it is
		// what this shipped as until the app was actually opened.
		expect(new URL(saved.url).pathname).toBe(`/stickers/${saved.id}`);
		expect(new URL(saved.url).searchParams.get("token")).toBeTruthy();
		expect((await listStickers(authorId)).map((sticker) => sticker.id)).toEqual([saved.id]);
	});

	it("is private to its owner", async () => {
		const { authorId, outsiderId } = await makeConversation();
		await addSticker(authorId, await makeImage());

		expect(await listStickers(outsiderId)).toEqual([]);
		// Scoped by owner rather than fetched and compared, so a miss never
		// confirms that somebody else's sticker id exists.
		await expect(removeSticker(outsiderId, (await listStickers(authorId))[0]!.id)).rejects.toThrow(NotFoundError);
	});

	it("takes its file with it when removed", async () => {
		const { authorId } = await makeConversation();
		const saved = await addSticker(authorId, await makeImage());

		await removeSticker(authorId, saved.id);

		expect(await listStickers(authorId)).toEqual([]);
		expect(await findAttachmentPath(saved.id)).toBeNull();
	});
});

describe("sending a sticker", () => {
	it("copies it into the message rather than pointing at the tray", async () => {
		// The reason it is a copy: removing a sticker from the tray must not blank
		// a picture out of a conversation it was already sent to.
		const { conversationId, authorId } = await makeConversation();
		const saved = await addSticker(authorId, await makeImage());

		const message = await sendMessage(authorId, conversationId, { content: "", stickerId: saved.id });

		expect(message.isSticker).toBe(true);
		expect(message.attachments).toHaveLength(1);
		expect(message.attachments[0]!.id).not.toBe(saved.id);

		await removeSticker(authorId, saved.id);
		expect(await findAttachmentPath(message.attachments[0]!.id)).not.toBeNull();
	});

	it("refuses somebody else's sticker", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const saved = await addSticker(outsiderId, await makeImage());

		await expect(sendMessage(authorId, conversationId, { content: "", stickerId: saved.id })).rejects.toThrow(
			NotFoundError,
		);
	});
});

describe("a built-in sticker", () => {
	it("is stored by name and comes back on the message, with no file behind it", async () => {
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", stickerKey: "wave" });
		expect(message.stickerKey).toBe("wave");
		expect(message.attachments).toHaveLength(0);
	});

	it("is only one of the names every client can draw", () => {
		expect(sendMessageSchema.safeParse({ stickerKey: "party" }).success).toBe(true);
		expect(sendMessageSchema.safeParse({ stickerKey: "<script>" }).success).toBe(false);
	});
});
