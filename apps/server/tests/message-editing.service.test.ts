import { readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	createConversation,
	listConversationsForUser,
	markConversationRead,
} from "../src/modules/conversations/conversations.service.js";
import {
	deleteMessage,
	editMessage,
	hideMessageForUser,
	listMessageEdits,
	listMessages,
	sendMessage,
} from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const UPLOAD_DIR = ".data/test-uploads";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

describe("message lifecycle", () => {
	it("rebuilds group mentions and links from edited text without repeating arrival alerts", async () => {
		const { authorId, peerId, outsiderId } = await makeConversation();
		const { id: conversationId } = await createConversation(authorId, {
			participantIds: [peerId, outsiderId],
			name: "Edit mentions",
		});
		const peer = await prisma.user.findUniqueOrThrow({ where: { id: peerId }, select: { handle: true } });
		const sent = await sendMessage(authorId, conversationId, {
			content: `@${peer.handle} https://old.example/path`,
			mentionedUserIds: [peerId],
		});
		fakeIO.emits.length = 0;
		const edited = await editMessage(authorId, conversationId, sent.id, {
			content: `Meet @${peer.handle.toUpperCase()} https://new.example/path`,
		});
		expect(edited.mentionedUserIds).toEqual([peerId]);
		expect(await prisma.messageLink.findMany({ where: { messageId: sent.id }, select: { url: true } })).toEqual([
			{ url: "https://new.example/path" },
		]);
		expect(fakeIO.emits.some((emit) => emit.event === "message:new")).toBe(false);
		const cleared = await editMessage(authorId, conversationId, sent.id, {
			content: `mail@${peer.handle} https://host/@${peer.handle}`,
		});
		expect(cleared.mentionedUserIds).toEqual([]);
	});

	it("does not add mentions when editing a direct message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const peer = await prisma.user.findUniqueOrThrow({ where: { id: peerId }, select: { handle: true } });
		const sent = await sendMessage(authorId, conversationId, { content: "original" });
		expect(
			(await editMessage(authorId, conversationId, sent.id, { content: `@${peer.handle}` })).mentionedUserIds,
		).toEqual([]);
	});

	it("the cleanup migration removes legacy tombstone history while retaining live history", async () => {
		const { conversationId, authorId } = await makeConversation();
		const gone = await sendMessage(authorId, conversationId, { content: "gone" });
		const live = await sendMessage(authorId, conversationId, { content: "live original" });
		await editMessage(authorId, conversationId, live.id, { content: "live revision" });
		await deleteMessage(authorId, conversationId, gone.id);
		await prisma.messageEdit.create({ data: { messageId: gone.id, content: "legacy secret" } });
		const migration = await readFile(
			new URL("../prisma/migrations/20260915090000_retract_message_edit_history/migration.sql", import.meta.url),
			"utf8",
		);
		await prisma.$executeRawUnsafe(migration);
		expect(await prisma.messageEdit.count({ where: { messageId: gone.id } })).toBe(0);
		expect(await listMessageEdits(authorId, conversationId, live.id)).toMatchObject([{ content: "live original" }]);
	});
	it("retracts previous versions and refuses history to both sender and recipient", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private original" });
		await editMessage(authorId, conversationId, sent.id, { content: "private revision" });
		await deleteMessage(authorId, conversationId, sent.id);
		expect(await prisma.messageEdit.count({ where: { messageId: sent.id } })).toBe(0);
		await expect(listMessageEdits(peerId, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(listMessageEdits(authorId, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("does not expose legacy history and cleans it on a repeated delete", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "legacy" });
		await deleteMessage(authorId, conversationId, sent.id);
		await prisma.messageEdit.create({ data: { messageId: sent.id, content: "pre-fix history" } });
		await expect(listMessageEdits(peerId, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
		await deleteMessage(authorId, conversationId, sent.id);
		expect(await prisma.messageEdit.count({ where: { messageId: sent.id } })).toBe(0);
	});

	it("serializes editing against retraction without leaving a previous version", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "original" });
		await Promise.allSettled([
			editMessage(authorId, conversationId, sent.id, { content: "concurrent edit" }),
			deleteMessage(authorId, conversationId, sent.id),
		]);
		expect(await prisma.messageEdit.count({ where: { messageId: sent.id } })).toBe(0);
		expect(await prisma.message.findUnique({ where: { id: sent.id } })).toMatchObject({
			content: "",
			deletedAt: expect.any(Date),
		});
	});
	it("keeps every previous version when a message is edited", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "first version" });
		await editMessage(authorId, conversationId, sent.id, { content: "second version" });
		await editMessage(authorId, conversationId, sent.id, { content: "current version" });

		const edits = await listMessageEdits(authorId, conversationId, sent.id);

		expect(edits.map((edit) => edit.content)).toEqual(["second version", "first version"]);
	});

	it("refuses edits after 8 hours", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "old message" });
		await prisma.message.update({
			where: { id: sent.id },
			data: { createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
		});

		await expect(editMessage(authorId, conversationId, sent.id, { content: "rewrite" })).rejects.toThrow(
			"Messages can only be edited for 8 hours",
		);
	});

	it("publishes the author action deadline with each user message", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "time boxed" });

		expect(Date.parse(sent.authorActionExpiresAt!) - Date.parse(sent.createdAt)).toBe(8 * 60 * 60 * 1000);
	});

	it("hides a message only from the user who chose delete for me", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "keep for others" });

		await hideMessageForUser(peerId, conversationId, sent.id);

		expect((await listMessages(peerId, conversationId, { limit: 50 })).map((message) => message.id)).not.toContain(
			sent.id,
		);
		expect((await listMessages(authorId, conversationId, { limit: 50 })).map((message) => message.id)).toContain(
			sent.id,
		);
		const [peerConversation] = (await listConversationsForUser(peerId)).items;
		expect(peerConversation!.lastMessage).toBeNull();
		expect(peerConversation!.unreadCount).toBe(0);
		const [authorConversation] = (await listConversationsForUser(authorId)).items;
		expect(authorConversation!.lastMessage?.id).toBe(sent.id);
	});

	it("reveals the previous sidebar message after the newest is hidden", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const first = await sendMessage(authorId, conversationId, { content: "keep this preview" });
		const newest = await sendMessage(authorId, conversationId, { content: "hide this preview" });

		await hideMessageForUser(peerId, conversationId, newest.id);

		const [conversation] = (await listConversationsForUser(peerId)).items;
		expect(conversation!.lastMessage?.id).toBe(first.id);
		expect(conversation!.unreadCount).toBe(1);
	});

	it("counts unread messages correctly when the read marker shares their timestamp", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await Promise.all([
			sendMessage(authorId, conversationId, { content: "same time one" }),
			sendMessage(authorId, conversationId, { content: "same time two" }),
		]);
		// Taken from one of the messages rather than written as a calendar date.
		// This was a hardcoded 2026-08-29, chosen because it was safely in the
		// future — and it stopped being in the future on 2026-08-29, at which
		// point both messages moved to *before* the participant's `joinedAt` and
		// the unread query correctly stopped counting either of them. The test
		// then failed for a reason that had nothing to do with what it checks,
		// which is the tie-break on `(createdAt, id)` when two messages share a
		// timestamp. A value derived from the rows cannot rot.
		const sharedTimestamp = new Date(sent[1]!.createdAt);
		await prisma.message.updateMany({
			where: { id: { in: sent.map((message) => message.id) } },
			data: { createdAt: sharedTimestamp },
		});
		const [earlierId] = sent.map((message) => message.id).sort();
		await markConversationRead(peerId, conversationId, { messageId: earlierId! });

		const [conversation] = (await listConversationsForUser(peerId)).items;
		expect(conversation!.unreadCount).toBe(1);
	});

	it("allows a shared tombstone to be hidden for one user", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "retracted" });
		await deleteMessage(authorId, conversationId, sent.id);

		await hideMessageForUser(peerId, conversationId, sent.id);

		expect((await listMessages(peerId, conversationId, { limit: 50 })).map((message) => message.id)).not.toContain(
			sent.id,
		);
	});
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** The `message:updated` emits only — setting up a conversation emits others. */
function updateEmits() {
	return fakeIO.emits.filter((emit) => emit.event === "message:updated");
}

async function makeImage(): Promise<Buffer> {
	return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } } })
		.jpeg()
		.toBuffer();
}

/**
 * A direct conversation and a third person outside it, built with `prisma`
 * rather than `register()`.
 *
 * These tests are not about authentication, and bcrypt at cost 12 four times per
 * test is exactly the slowness `tests/setup.ts` warns turns the truncate hook
 * into a trap.
 */
async function makeConversation(): Promise<{
	conversationId: string;
	authorId: string;
	peerId: string;
	outsiderId: string;
}> {
	const [author, peer, outsider] = await Promise.all([
		prisma.user.create({
			data: { email: "minh@chatty.test", handle: "minh_test", displayName: "Minh", passwordHash: "x" },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "binh@chatty.test", handle: "binh_test", displayName: "Binh", passwordHash: "x" },
			select: { id: true },
		}),
	]);
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, peerId: peer.id, outsiderId: outsider.id };
}

describe("editMessage", () => {
	it("replaces the text and records that it was edited", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "chào An" });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "chào An nhé" });

		expect(edited.content).toBe("chào An nhé");
		expect(edited.editedAt).not.toBeNull();
		expect(edited.deletedAt).toBeNull();
	});

	it("broadcasts message:updated to the conversation room", async () => {
		// Without this the text changes in the database and nobody else's screen
		// moves — the author would be the only person reading the new version.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "typo" });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "fixed" });

		expect(updateEmits()).toEqual([{ room: conversationId, event: "message:updated", payload: edited }]);
	});

	it("trims the new text, so three spaces is not an edit that empties a message", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "hello" });

		await expect(editMessage(authorId, conversationId, sent.id, { content: "   " })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("allows clearing the caption of a message that still has its image", async () => {
		// The send rule, restated: a message has to be *something*. A picture is.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "look", attachments: [await makeImage()] });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "" });

		expect(edited.content).toBe("");
		expect(edited.attachments).not.toHaveLength(0);
	});

	it("refuses someone who did not write the message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "mine" });

		await expect(editMessage(peerId, conversationId, sent.id, { content: "yours now" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("refuses someone outside the conversation, without confirming the message exists", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private" });

		// NotFoundError rather than ForbiddenError: a 403 here would confirm that
		// this conversation id is real to someone who cannot see it.
		await expect(editMessage(outsiderId, conversationId, sent.id, { content: "hi" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("refuses a message id from another conversation", async () => {
		const first = await makeConversation();
		const other = await prisma.conversation.create({
			data: { participants: { create: [{ userId: first.authorId }] } },
			select: { id: true },
		});
		const elsewhere = await sendMessage(first.authorId, other.id, { content: "over here" });

		await expect(
			editMessage(first.authorId, first.conversationId, elsewhere.id, { content: "moved" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("refuses a message that was already deleted", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "gone" });
		await deleteMessage(authorId, conversationId, sent.id);

		await expect(editMessage(authorId, conversationId, sent.id, { content: "back" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("refuses a system message, which nobody wrote", async () => {
		const { conversationId, authorId } = await makeConversation();
		const systemMessage = await prisma.message.create({
			data: { conversationId, kind: "SYSTEM", content: "An added Binh" },
			select: { id: true },
		});

		await expect(
			editMessage(authorId, conversationId, systemMessage.id, { content: "An removed Binh" }),
		).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("does not move the conversation to the top of the sidebar", async () => {
		// Fixing a typo in something sent last week is not new activity. Bumping
		// updatedAt would raise that thread above genuinely newer ones.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "typo" });
		const before = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { updatedAt: true },
		});

		await editMessage(authorId, conversationId, sent.id, { content: "fixed" });

		const after = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { updatedAt: true },
		});
		expect(after.updatedAt).toEqual(before.updatedAt);
	});
});

describe("deleteMessage", () => {
	it("refuses delete for everyone after 8 hours", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "too old to retract" });
		await prisma.message.update({
			where: { id: sent.id },
			data: { createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
		});

		await expect(deleteMessage(authorId, conversationId, sent.id)).rejects.toThrow(
			"Messages can only be deleted for everyone for 8 hours",
		);
	});

	it("empties the text and marks the message deleted", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "said too much" });

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(deleted.deletedAt).not.toBeNull();
		expect(deleted.content).toBe("");
	});

	it("leaves nothing of the text in the database", async () => {
		// "Deleted" has to mean gone, not hidden behind a flag the next query
		// forgets to check. The migration's check constraint enforces the same rule.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "a secret" });

		await deleteMessage(authorId, conversationId, sent.id);

		const row = await prisma.message.findUniqueOrThrow({ where: { id: sent.id }, select: { content: true } });
		expect(row.content).toBe("");
	});

	it("removes the image, its row, and its file", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "look", attachments: [await makeImage()] });
		const attachmentId = sent.attachments[0]!.id;
		expect(await findAttachmentPath(attachmentId)).not.toBeNull();

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(deleted.attachments).toHaveLength(0);
		await expect(prisma.attachment.count({ where: { id: attachmentId } })).resolves.toBe(0);
		expect(await findAttachmentPath(attachmentId)).toBeNull();
	});

	it("keeps the message in the conversation, in its place", async () => {
		// The tombstone is the point: hard-deleting the row would break the paging
		// cursor and every read marker pointing at it.
		const { conversationId, authorId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "first" });
		const second = await sendMessage(authorId, conversationId, { content: "second" });
		await sendMessage(authorId, conversationId, { content: "third" });

		await deleteMessage(authorId, conversationId, second.id);

		const messages = await listMessages(authorId, conversationId, { limit: 50 });
		expect(messages.map((message) => message.content)).toEqual(["third", "", "first"]);
		expect(messages[1]!.deletedAt).not.toBeNull();
	});

	it("does not relight the badge on a conversation the reader had finished", async () => {
		// The bug a hard delete would have shipped: the unread query LEFT JOINs the
		// reader's marker and treats a miss as "nothing read yet", so deleting the
		// message their marker points at would have counted the whole history again.
		const { conversationId, authorId, peerId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "one" });
		const newest = await sendMessage(authorId, conversationId, { content: "two" });
		await markConversationRead(peerId, conversationId, { messageId: newest.id });

		await deleteMessage(authorId, conversationId, newest.id);

		const [conversation] = (await listConversationsForUser(peerId)).items;
		expect(conversation!.unreadCount).toBe(0);
	});

	it("stops counting a deleted message as unread", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "never mind" });

		const [before] = (await listConversationsForUser(peerId)).items;
		expect(before!.unreadCount).toBe(1);

		await deleteMessage(authorId, conversationId, sent.id);

		const [after] = (await listConversationsForUser(peerId)).items;
		expect(after!.unreadCount).toBe(0);
	});

	it("broadcasts message:updated to the conversation room", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(updateEmits()).toEqual([{ room: conversationId, event: "message:updated", payload: deleted }]);
	});

	it("is idempotent, and says nothing the second time", async () => {
		// Two tabs pressing the button is the ordinary case, not an error — and a
		// second broadcast would only re-render what is already on screen.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });
		const first = await deleteMessage(authorId, conversationId, sent.id);

		const second = await deleteMessage(authorId, conversationId, sent.id);

		expect(second.deletedAt).toBe(first.deletedAt);
		expect(updateEmits()).toHaveLength(1);
	});

	it("refuses someone who did not write the message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "mine" });

		await expect(deleteMessage(peerId, conversationId, sent.id)).rejects.toBeInstanceOf(ForbiddenError);
		await expect(prisma.message.count({ where: { id: sent.id, deletedAt: null } })).resolves.toBe(1);
	});

	it("refuses a system message, so the group log cannot be rewritten", async () => {
		const { conversationId, authorId } = await makeConversation();
		const systemMessage = await prisma.message.create({
			data: { conversationId, kind: "SYSTEM", content: "An added Binh" },
			select: { id: true },
		});

		await expect(deleteMessage(authorId, conversationId, systemMessage.id)).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("refuses someone outside the conversation", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private" });

		await expect(deleteMessage(outsiderId, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});
