import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAttachmentUrls, findAttachmentPath } from "../src/lib/attachment-storage.js";
import { isValidAttachmentToken, signAttachmentToken } from "../src/lib/attachment-token.js";
import * as attachmentTokens from "../src/lib/attachment-token.js";
import { ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { getAttachmentFilePath } from "../src/modules/attachments/attachments.service.js";
import { deleteMessage, listMessages, sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO } from "./fake-io.js";

const UPLOAD_DIR = ".data/test-uploads";

// `sendMessage` broadcasts, and getIO() throws when nothing has been installed.
beforeEach(() => {
	installFakeIO();
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** A real JPEG, wider than it is tall, and larger than the 1600px cap. */
async function makeImage(width = 2400, height = 1200): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
		.jpeg()
		.toBuffer();
}

/** A conversation between two people, created directly — these tests are not about auth. */
async function makeConversation(): Promise<{ conversationId: string; authorId: string; outsiderId: string }> {
	const author = await prisma.user.create({
		data: { email: "minh@chatty.test", handle: "minh_test", displayName: "Minh", passwordHash: "x" },
		select: { id: true },
	});
	const peer = await prisma.user.create({
		data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
		select: { id: true },
	});
	const outsider = await prisma.user.create({
		data: { email: "binh@chatty.test", handle: "binh_test", displayName: "Binh", passwordHash: "x" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, outsiderId: outsider.id };
}

describe("sendMessage with an attachment", () => {
	it("stores the image and returns it on the message", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, {
			content: "look",
			attachments: [await makeImage()],
		});

		expect(message.content).toBe("look");
		expect(message.attachments).not.toHaveLength(0);
		expect(message.attachments[0]!.byteSize).toBeGreaterThan(0);
	});

	it("scales the longest edge down to the cap and keeps the aspect ratio", async () => {
		// 2400x1200 is 2:1, so the stored image must be 1600x800 — not 1600x1600,
		// which is what `fit: "cover"` (what avatars use) would produce.
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		expect(message.attachments[0]!.width).toBe(1600);
		expect(message.attachments[0]!.height).toBe(800);
	});

	it("does not enlarge an image that is already smaller than the cap", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, {
			content: "",
			attachments: [await makeImage(400, 300)],
		});

		expect(message.attachments[0]).toMatchObject({ width: 400, height: 300 });
	});

	it("writes the file under the attachment's own id", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		expect(await findAttachmentPath(message.attachments[0]!.id)).not.toBeNull();
	});

	it("allows a message that is only an image", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		expect(message.content).toBe("");
		expect(message.attachments).not.toHaveLength(0);
	});

	it("leaves attachment null on a text-only message", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "just text" });

		expect(message.attachments).toHaveLength(0);
	});

	it("rejects a file that is not an image, without creating a message", async () => {
		// The MIME filter on the upload middleware can be lied to; the re-encode
		// is the check that actually holds.
		const { conversationId, authorId } = await makeConversation();

		await expect(
			sendMessage(authorId, conversationId, { content: "", attachments: [Buffer.from("not an image at all")] }),
		).rejects.toBeInstanceOf(ValidationError);

		expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
	});

	it("refuses to send into a conversation the author is not in", async () => {
		// Membership is checked before anything is written to disk.
		const { conversationId, outsiderId } = await makeConversation();

		await expect(
			sendMessage(outsiderId, conversationId, { content: "", attachments: [await makeImage()] }),
		).rejects.toThrow();

		expect(await prisma.attachment.count()).toBe(0);
	});

	it("comes back on the message list too", async () => {
		const { conversationId, authorId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		const [listed] = await listMessages(authorId, conversationId, { limit: 50 });

		expect(listed!.attachments).not.toHaveLength(0);
	});

	it("addresses the image by a signed token rather than a bare path", async () => {
		// The id is the stable handle; the url is a capability that is re-minted on
		// every read and must never be treated as an identity. Note the two mints
		// here are byte-identical — a JWT's `iat` has one-second resolution, so two
		// signed in the same second match. That is precisely why the id, and not
		// the url, is what anything downstream keys on.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		const [listed] = await listMessages(authorId, conversationId, { limit: 50 });

		expect(listed!.attachments[0]!.id).toBe(sent.attachments[0]!.id);
		expect(new URL(listed!.attachments[0]!.url).searchParams.get("token")).toBeTruthy();
	});

	it("is deleted with its message", async () => {
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		await prisma.message.delete({ where: { id: message.id } });

		expect(await prisma.attachment.count({ where: { id: message.attachments[0]!.id } })).toBe(0);
	});
});

describe("a message with several images", () => {
	it("keeps them in the order the sender picked", async () => {
		// The whole reason `position` is a column. The rows are written inside one
		// transaction and share a `createdAt` to the millisecond, so ordering by
		// time would let the gallery shuffle itself between two reads.
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, {
			content: "three of them",
			attachments: [await makeImage(400, 300), await makeImage(300, 400), await makeImage(500, 500)],
		});

		expect(message.attachments.map((attachment) => [attachment.width, attachment.height])).toEqual([
			[400, 300],
			[300, 400],
			[500, 500],
		]);
	});

	it("gives every image its own row, file and signed url", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, {
			content: "",
			attachments: [await makeImage(200, 200), await makeImage(200, 200)],
		});

		expect(await prisma.attachment.count()).toBe(2);
		for (const attachment of message.attachments) {
			expect(await findAttachmentPath(attachment.id)).not.toBeNull();
			expect(new URL(attachment.url).searchParams.get("token")).toBeTruthy();
		}
		// Two images of one message must not share an id, or one would serve the
		// other and the gallery would be the same picture twice.
		expect(new Set(message.attachments.map((attachment) => attachment.id)).size).toBe(2);
	});

	it("reads back in the same order it was written", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, {
			content: "",
			attachments: [await makeImage(400, 300), await makeImage(300, 400)],
		});

		const [listed] = await listMessages(authorId, conversationId, { limit: 10 });

		expect(listed!.attachments.map((attachment) => attachment.id)).toEqual(
			sent.attachments.map((attachment) => attachment.id),
		);
	});

	it("takes every file with it when the message is deleted", async () => {
		// Nine files surviving because the message only remembered one of them is
		// exactly the leak the single-attachment shape could not have.
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, {
			content: "",
			attachments: [await makeImage(200, 200), await makeImage(200, 200), await makeImage(200, 200)],
		});

		await deleteMessage(authorId, conversationId, message.id);

		expect(await prisma.attachment.count()).toBe(0);
		for (const attachment of message.attachments) {
			expect(await findAttachmentPath(attachment.id)).toBeNull();
		}
	});

	it("refuses two images claiming the same slot", async () => {
		// The database's job, not the service's: the unique on (messageId,
		// position) is what makes the order a fact rather than a convention.
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, {
			content: "",
			attachments: [await makeImage(200, 200)],
		});

		await expect(
			prisma.attachment.create({
				data: {
					messageId: message.id,
					conversationId,
					position: 0,
					mediaType: "image/webp",
					width: 10,
					height: 10,
					byteSize: 1,
				},
				select: { id: true },
			}),
		).rejects.toThrow();
	});
});

describe("attachment tokens", () => {
	it("accepts a token minted for the same attachment", () => {
		expect(isValidAttachmentToken(signAttachmentToken("attachment-1"), "attachment-1")).toBe(true);
	});

	it("refuses a valid token replayed against a different attachment", () => {
		// Without the id in the payload, one leaked URL would open every image.
		expect(isValidAttachmentToken(signAttachmentToken("attachment-1"), "attachment-2")).toBe(false);
	});

	it("refuses a token that is not a token", () => {
		expect(isValidAttachmentToken("nonsense", "attachment-1")).toBe(false);
	});
});

describe("buildAttachmentUrls", () => {
	afterEach(() => vi.restoreAllMocks());

	it("derives the thumbnail URL from the full-size one, so both carry one signature", () => {
		// Equal tokens are a construction guarantee, not a thumbnail-validity fix:
		// independently signed, unexpired tokens were also valid for either size.
		const sign = vi.spyOn(attachmentTokens, "signAttachmentToken");
		const { url, thumbUrl } = buildAttachmentUrls("attachment-1", true);

		expect(sign).toHaveBeenCalledExactlyOnceWith("attachment-1");
		expect(thumbUrl).toBe(`${url}&size=thumb`);
		expect(isValidAttachmentToken(new URL(url).searchParams.get("token")!, "attachment-1")).toBe(true);
	});

	it("has no thumbnail URL when there is no thumbnail", () => {
		// A file and a voice note reach this with `false`, and a null is what tells
		// the gallery to render an icon rather than fetch a picture that is not there.
		expect(buildAttachmentUrls("attachment-1", false).thumbUrl).toBeNull();
	});
});

describe("getAttachmentFilePath", () => {
	it("returns the path for a valid token", async () => {
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });
		const attachmentId = message.attachments[0]!.id;

		const filePath = await getAttachmentFilePath(attachmentId, signAttachmentToken(attachmentId));

		expect(filePath).toContain(attachmentId);
	});

	it("hides a real attachment behind a bad token", async () => {
		// 404 rather than 401 on purpose: 401 would confirm the id exists.
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachments: [await makeImage()] });

		await expect(getAttachmentFilePath(message.attachments[0]!.id, "nonsense")).rejects.toThrow(
			"Attachment not found",
		);
	});
});
