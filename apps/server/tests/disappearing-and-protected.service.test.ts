import { rm } from "node:fs/promises";
import type { MessageDTO } from "@chatty/shared-types";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { getAttachmentUrls } from "../src/modules/attachments/attachments.service.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	addParticipant,
	createConversation,
	listConversationsForUser,
	setConversationMessageTimer,
	setConversationSharingRestriction,
} from "../src/modules/conversations/conversations.service.js";
import { setMessageTimerSchema } from "../src/modules/conversations/conversations.schema.js";
import { countUnreadByConversation } from "../src/modules/conversations/conversations.shared.js";
import {
	deleteMessage,
	editMessage,
	expireDueMessages,
	getMessageContext,
	listMessages,
	openProtectedMessage,
	saveMessageForUser,
	sendMessage,
	setMessagePinned,
	toggleReaction,
} from "../src/modules/messages/messages.service.js";
import { searchMessages } from "../src/modules/search/search.service.js";
import { getUserById, updateProfile } from "../src/modules/users/users.service.js";
import { updateProfileSchema } from "../src/modules/users/users.schema.js";
import {
	getConversationVaultSummary,
	listConversationLinks,
	listConversationMedia,
} from "../src/modules/vault/vault.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const DAY_MS = 86_400_000;
let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

afterAll(async () => {
	await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
});

async function makeUser(name: string, defaultMessageTimerSeconds: number | null = null): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			handle: `${name}_test`,
			displayName: name,
			passwordHash: "x",
			defaultMessageTimerSeconds,
		},
		select: { id: true },
	});

	return user.id;
}

async function direct() {
	const minh = await makeUser("minh");
	const an = await makeUser("an");
	const conversation = await createConversation(minh, { participantIds: [an] });

	return { minh, an, conversationId: conversation.id };
}

function image(): Promise<Buffer> {
	return sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 40, b: 80 } } })
		.png()
		.toBuffer();
}

/** Moves a message's expiry into the past, as time passing would. */
async function expire(messageId: string): Promise<void> {
	await prisma.message.update({ where: { id: messageId }, data: { expiresAt: new Date(Date.now() - 1000) } });
}

function emitsOf(event: string) {
	return fakeIO.emits.filter((emit) => emit.event === event);
}

describe("conversation message timer", () => {
	it("lets either person in a direct chat set it, announces who did, and is idempotent", async () => {
		const { minh, an, conversationId } = await direct();

		const updated = await setConversationMessageTimer(an, conversationId, { seconds: 86_400 });
		expect(updated.messageTimerSeconds).toBe(86_400);
		const system = emitsOf("message:new").map((emit) => (emit.payload as MessageDTO).content);
		expect(system).toEqual(["an set new messages to disappear after 24 hours"]);
		expect(emitsOf("conversation:updated")[0]?.payload).toMatchObject({ messageTimerSeconds: 86_400 });

		fakeIO.emits.length = 0;
		await setConversationMessageTimer(minh, conversationId, { seconds: 86_400 });
		expect(fakeIO.emits).toHaveLength(0);

		await setConversationMessageTimer(minh, conversationId, { seconds: null });
		expect((emitsOf("message:new")[0]?.payload as MessageDTO).content).toBe(
			"minh turned off disappearing messages",
		);
	});

	it("is admin-only in a group", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await createConversation(minh, { participantIds: [an, binh], name: "Team" });

		await expect(setConversationMessageTimer(an, group.id, { seconds: 604_800 })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		const updated = await setConversationMessageTimer(minh, group.id, { seconds: 604_800 });
		expect(updated.messageTimerSeconds).toBe(604_800);
	});

	it("accepts only the offered presets, at the boundary and in the database", async () => {
		expect(() => setMessageTimerSchema.parse({ seconds: 3600 })).toThrow();
		expect(setMessageTimerSchema.parse({ seconds: 7_776_000 })).toEqual({ seconds: 7_776_000 });
		const { conversationId } = await direct();
		await expect(
			prisma.conversation.update({ where: { id: conversationId }, data: { messageTimerSeconds: 5 } }),
		).rejects.toThrow();
	});

	it("applies to messages sent afterwards, never to earlier ones", async () => {
		const { minh, an, conversationId } = await direct();
		const before = await sendMessage(minh, conversationId, { content: "kept" });
		await setConversationMessageTimer(an, conversationId, { seconds: 86_400 });
		const sentAt = Date.now();
		const after = await sendMessage(minh, conversationId, { content: "fleeting" });

		expect(before.expiresAt).toBeNull();
		const expiresAt = Date.parse(after.expiresAt!);
		expect(expiresAt - sentAt).toBeGreaterThan(DAY_MS - 5_000);
		expect(expiresAt - sentAt).toBeLessThan(DAY_MS + 5_000);
		const stored = await prisma.message.findUniqueOrThrow({
			where: { id: before.id },
			select: { expiresAt: true },
		});
		expect(stored.expiresAt).toBeNull();
	});
});

describe("default timer for new chats", () => {
	it("starts new direct chats and groups with the creator's default, stated as their habit", async () => {
		const minh = await makeUser("minh", 604_800);
		const an = await makeUser("an");
		const binh = await makeUser("binh");

		const chat = await createConversation(minh, { participantIds: [an] });
		expect(chat.messageTimerSeconds).toBe(604_800);
		expect(chat.lastMessage?.kind).toBe("system");
		expect(chat.lastMessage?.content).toBe("New messages disappear after 7 days. minh uses this for new chats.");

		const group = await createConversation(minh, { participantIds: [an, binh], name: "Team" });
		expect(group.messageTimerSeconds).toBe(604_800);
	});

	it("leaves existing chats, chats others start, and the Saved chat alone", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const first = await createConversation(minh, { participantIds: [an] });
		await updateProfile(minh, { defaultMessageTimerSeconds: 86_400 });

		const again = await createConversation(minh, { participantIds: [an] });
		expect(again.id).toBe(first.id);
		expect(again.messageTimerSeconds).toBeNull();

		const saved = await createConversation(minh, { participantIds: [minh] });
		expect(saved.messageTimerSeconds).toBeNull();

		const binh = await makeUser("binh");
		const startedByBinh = await createConversation(binh, { participantIds: [minh] });
		expect(startedByBinh.messageTimerSeconds).toBeNull();
	});

	it("is a profile setting limited to the presets", async () => {
		const minh = await makeUser("minh");
		expect((await getUserById(minh)).defaultMessageTimerSeconds).toBeNull();
		expect((await updateProfile(minh, { defaultMessageTimerSeconds: 7_776_000 })).defaultMessageTimerSeconds).toBe(
			7_776_000,
		);
		expect((await updateProfile(minh, { defaultMessageTimerSeconds: null })).defaultMessageTimerSeconds).toBeNull();
		expect(() => updateProfileSchema.parse({ defaultMessageTimerSeconds: 60 })).toThrow();
	});
});

describe("expired messages, before the sweep", () => {
	it("disappear from history, context, the sidebar, search and unread counts at their instant", async () => {
		const { minh, an, conversationId } = await direct();
		await sendMessage(minh, conversationId, { content: "earlier words" });
		const gone = await sendMessage(minh, conversationId, { content: "vanishing secret" });
		await expire(gone.id);

		const history = await listMessages(an, conversationId, { limit: 50 });
		expect(history.map((message) => message.content)).toEqual(["earlier words"]);
		await expect(getMessageContext(an, conversationId, gone.id, { limit: 20 })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		const sidebar = (await listConversationsForUser(an)).items.find((item) => item.id === conversationId);
		expect(sidebar?.lastMessage?.content).toBe("earlier words");
		expect((await searchMessages(an, { query: "vanishing", limit: 20 })).results).toHaveLength(0);
		expect((await countUnreadByConversation(an, [conversationId])).get(conversationId)).toBe(1);
	});

	it("refuse every action on them", async () => {
		const { minh, an, conversationId } = await direct();
		const gone = await sendMessage(minh, conversationId, { content: "too late" });
		await expire(gone.id);

		await expect(toggleReaction(an, conversationId, gone.id, { emoji: "❤️" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		await expect(editMessage(minh, conversationId, gone.id, { content: "x" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		await expect(deleteMessage(minh, conversationId, gone.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(setMessagePinned(an, conversationId, gone.id, true)).rejects.toBeInstanceOf(NotFoundError);
		await expect(saveMessageForUser(an, conversationId, gone.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(sendMessage(an, conversationId, { content: "re", replyToId: gone.id })).rejects.toBeInstanceOf(
			ValidationError,
		);
		await expect(
			sendMessage(an, conversationId, { content: "", forwardOfMessageId: gone.id }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("never cost a page its neighbour when the cursor itself has expired", async () => {
		const { minh, an, conversationId } = await direct();
		const sent: MessageDTO[] = [];
		for (const content of ["one", "two", "three", "four"])
			sent.push(await sendMessage(minh, conversationId, { content }));
		// The client holds "three" as its oldest message; it expires before the next page.
		await expire(sent[2]!.id);

		const older = await listMessages(an, conversationId, { limit: 50, before: sent[2]!.id });
		expect(older.map((message) => message.content)).toEqual(["two", "one"]);
		const newer = await listMessages(an, conversationId, { limit: 50, after: sent[1]!.id });
		expect(newer.map((message) => message.content)).toEqual(["four"]);
	});
});

describe("expiry sweep", () => {
	it("erases the content and everything attached to it, then tells the conversation", async () => {
		const { minh, an, conversationId } = await direct();
		const message = await sendMessage(minh, conversationId, {
			content: "see https://example.com",
			attachments: [await image()],
		});
		const attachmentId = message.attachments[0]!.id;
		await toggleReaction(an, conversationId, message.id, { emoji: "❤️" });
		await saveMessageForUser(an, conversationId, message.id);
		await setMessagePinned(an, conversationId, message.id, true);
		const kept = await sendMessage(minh, conversationId, { content: "kept" });
		await expire(message.id);
		fakeIO.emits.length = 0;

		expect(await expireDueMessages()).toBe(1);

		const row = await prisma.message.findUniqueOrThrow({
			where: { id: message.id },
			select: {
				content: true,
				deletedAt: true,
				_count: { select: { attachments: true, links: true, reactions: true, stars: true, pinnedIn: true } },
			},
		});
		expect(row.content).toBe("");
		expect(row.deletedAt).not.toBeNull();
		expect(row._count).toEqual({ attachments: 0, links: 0, reactions: 0, stars: 0, pinnedIn: 0 });
		expect(await findAttachmentPath(attachmentId)).toBeNull();
		expect(emitsOf("message:expired")).toEqual([
			{ room: conversationId, event: "message:expired", payload: { conversationId, messageId: message.id } },
		]);
		expect(emitsOf("message:pins-updated")[0]?.payload).toEqual({ conversationId, pinnedMessages: [] });
		expect((await prisma.message.findUniqueOrThrow({ where: { id: kept.id } })).content).toBe("kept");

		expect(await expireDueMessages()).toBe(0);
	});
});

describe("protected messages", () => {
	it("withhold their content from everyone but the author, on the wire and on every read", async () => {
		const { minh, an, conversationId } = await direct();
		const sent = await sendMessage(minh, conversationId, {
			content: "only for you",
			attachments: [await image()],
			isProtected: true,
			clientId: "draft:protected-1",
		});

		expect(sent.content).toBe("only for you");
		expect(sent.attachments).toHaveLength(1);
		expect(sent.protection).toEqual({ openedByUserIds: [], imageCount: 1, hasText: true });
		expect(Date.parse(sent.expiresAt!) - Date.now()).toBeGreaterThan(DAY_MS - 5_000);

		const arrivals = emitsOf("message:new");
		const toRoom = arrivals.find((emit) => emit.room === conversationId);
		const toAuthor = arrivals.find((emit) => emit.room === `user:${minh}`);
		expect(toRoom?.except).toBe(`user:${minh}`);
		expect(toRoom?.payload).toMatchObject({ content: "", attachments: [], clientId: "draft:protected-1" });
		expect(JSON.stringify(toRoom?.payload)).not.toContain("only for you");
		expect(toAuthor?.payload).toMatchObject({ content: "only for you" });

		const recipientView = await listMessages(an, conversationId, { limit: 10 });
		expect(recipientView.at(-1)).toMatchObject({ content: "", attachments: [] });
		const authorView = await listMessages(minh, conversationId, { limit: 10 });
		expect(authorView.at(-1)?.content).toBe("only for you");
		const sidebar = (await listConversationsForUser(an)).items.find((item) => item.id === conversationId);
		expect(sidebar?.lastMessage?.content).toBe("");
	});

	it("last 24 hours even in a chat that keeps messages longer", async () => {
		const { minh, an, conversationId } = await direct();
		await setConversationMessageTimer(an, conversationId, { seconds: 604_800 });
		const sent = await sendMessage(minh, conversationId, { content: "short-lived", isProtected: true });
		expect(Date.parse(sent.expiresAt!) - Date.now()).toBeLessThan(DAY_MS + 5_000);
	});

	it("open once per recipient, tell the author, and then disappear within a minute", async () => {
		const { minh, an, conversationId } = await direct();
		const sent = await sendMessage(minh, conversationId, { content: "the secret", isProtected: true });
		fakeIO.emits.length = 0;

		const opened = await openProtectedMessage(an, conversationId, sent.id);
		expect(opened).toEqual({ content: "the secret", attachments: [] });
		await expect(openProtectedMessage(an, conversationId, sent.id)).rejects.toThrow(
			"You have already opened this message",
		);

		const toAuthor = emitsOf("message:updated").find((emit) => emit.room === `user:${minh}`);
		expect((toAuthor?.payload as MessageDTO).protection?.openedByUserIds).toEqual([an]);
		const row = await prisma.message.findUniqueOrThrow({ where: { id: sent.id }, select: { expiresAt: true } });
		expect(row.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(60_000);

		// The author may look again; that records nothing.
		expect((await openProtectedMessage(minh, conversationId, sent.id)).content).toBe("the secret");
		expect(await prisma.messageView.count({ where: { messageId: sent.id } })).toBe(1);
	});

	it("in a group, wait for everyone who was there when it was sent", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await createConversation(minh, { participantIds: [an, binh], name: "Team" });
		const sent = await sendMessage(minh, group.id, { content: "group secret", isProtected: true });
		const late = await makeUser("late");
		await addParticipant(minh, group.id, { userId: late });

		await openProtectedMessage(an, group.id, sent.id);
		const afterOne = await prisma.message.findUniqueOrThrow({
			where: { id: sent.id },
			select: { expiresAt: true },
		});
		expect(afterOne.expiresAt!.getTime()).toBe(Date.parse(sent.expiresAt!));

		await openProtectedMessage(binh, group.id, sent.id);
		const afterAll = await prisma.message.findUniqueOrThrow({
			where: { id: sent.id },
			select: { expiresAt: true },
		});
		expect(afterAll.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
	});

	it("cannot be edited, forwarded, saved, pinned, searched, or listed in shared media and links", async () => {
		const { minh, an, conversationId } = await direct();
		const elsewhere = await createConversation(an, { participantIds: [await makeUser("binh")] });
		const sent = await sendMessage(minh, conversationId, {
			content: "confidential https://secret.example",
			attachments: [await image()],
			isProtected: true,
		});

		await expect(editMessage(minh, conversationId, sent.id, { content: "x" })).rejects.toThrow(
			"A protected message cannot be edited",
		);
		await expect(
			sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: sent.id }),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(saveMessageForUser(an, conversationId, sent.id)).rejects.toThrow(
			"A protected message cannot be saved",
		);
		await expect(setMessagePinned(an, conversationId, sent.id, true)).rejects.toThrow(
			"A protected message cannot be pinned",
		);
		for (const viewer of [an, minh]) {
			expect((await searchMessages(viewer, { query: "confidential", limit: 20 })).results).toHaveLength(0);
		}
		expect((await listConversationMedia(an, conversationId, { kind: "image", limit: 20 })).items).toHaveLength(0);
		expect((await listConversationLinks(an, conversationId, { limit: 20 })).items).toHaveLength(0);
		expect(await getConversationVaultSummary(an, conversationId)).toMatchObject({ media: 0, links: 0 });
	});

	it("are quoted as a cover, for everyone, when someone replies", async () => {
		const { minh, an, conversationId } = await direct();
		const sent = await sendMessage(minh, conversationId, {
			content: "hidden words",
			attachments: [await image()],
			isProtected: true,
		});
		const reply = await sendMessage(an, conversationId, { content: "got it", replyToId: sent.id });

		expect(reply.replyTo).toMatchObject({
			content: "",
			hasAttachment: false,
			attachmentUrl: null,
			isProtected: true,
		});
		// History pages come newest first.
		const authorView = await listMessages(minh, conversationId, { limit: 10 });
		expect(authorView.find((message) => message.id === reply.id)?.replyTo?.content).toBe("");
	});

	it("need somebody to send them to", async () => {
		const minh = await makeUser("minh");
		const saved = await createConversation(minh, { participantIds: [minh] });
		await expect(sendMessage(minh, saved.id, { content: "note to self", isProtected: true })).rejects.toThrow(
			"A protected message needs someone to send it to",
		);
	});

	it("are refused by the database without an expiry", async () => {
		const { minh, conversationId } = await direct();
		await expect(
			prisma.message.create({ data: { conversationId, authorId: minh, content: "x", isProtected: true } }),
		).rejects.toThrow();
	});

	it("are erased by the sweep like any other expired message", async () => {
		const { minh, an, conversationId } = await direct();
		const sent = await sendMessage(minh, conversationId, { content: "brief", isProtected: true });
		await openProtectedMessage(an, conversationId, sent.id);
		await expire(sent.id);

		expect(await expireDueMessages()).toBe(1);
		expect(await prisma.messageView.count({ where: { messageId: sent.id } })).toBe(0);
		await expect(openProtectedMessage(minh, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("attachment URL renewal", () => {
	it("never hands a recipient a second look at a protected photo, nor any look at an expired one", async () => {
		const { minh, an, conversationId } = await direct();
		const sent = await sendMessage(minh, conversationId, {
			content: "",
			attachments: [await image()],
			isProtected: true,
		});
		const opened = await openProtectedMessage(an, conversationId, sent.id);
		const attachmentId = opened.attachments[0]!.id;

		await expect(getAttachmentUrls(an, attachmentId)).rejects.toBeInstanceOf(NotFoundError);
		expect((await getAttachmentUrls(minh, attachmentId)).url).toContain(attachmentId);

		const ordinary = await sendMessage(minh, conversationId, { content: "", attachments: [await image()] });
		await expire(ordinary.id);
		await expect(getAttachmentUrls(an, ordinary.attachments[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("forwarding restriction", () => {
	it("stops others forwarding an author's messages once they turn sharing off — old messages included", async () => {
		const { minh, an, conversationId } = await direct();
		const elsewhere = await createConversation(an, { participantIds: [await makeUser("binh")] });
		const earlier = await sendMessage(minh, conversationId, { content: "written before" });
		expect(earlier.isForwardable).toBe(true);

		fakeIO.emits.length = 0;
		await updateProfile(minh, { allowMessageForwarding: false });
		// Everyone already holding Minh's messages hears about it, in every shared chat.
		const notice = emitsOf("user:forwarding-changed")[0];
		expect(notice?.payload).toEqual({ userId: minh, allowMessageForwarding: false });
		expect(notice?.room).toEqual([conversationId]);

		const history = await listMessages(an, conversationId, { limit: 10 });
		expect(history.find((message) => message.id === earlier.id)?.isForwardable).toBe(false);
		await expect(sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: earlier.id })).rejects.toThrow(
			"This person doesn't allow their messages to be forwarded",
		);
		await expect(
			sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: earlier.id }),
		).rejects.toBeInstanceOf(ForbiddenError);

		// Their own words stay theirs to forward.
		const own = await sendMessage(an, conversationId, { content: "mine" });
		expect((await sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: own.id })).isForwarded).toBe(
			true,
		);

		await updateProfile(minh, { allowMessageForwarding: true });
		expect((await sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: earlier.id })).content).toBe(
			"written before",
		);
	});

	it("marks protected and system messages as never forwardable", async () => {
		const { minh, an, conversationId } = await direct();
		await setConversationMessageTimer(an, conversationId, { seconds: 86_400 });
		const sent = await sendMessage(minh, conversationId, { content: "x", isProtected: true });
		const history = await listMessages(minh, conversationId, { limit: 10 });

		expect(sent.isForwardable).toBe(false);
		expect(history.find((message) => message.kind === "system")?.isForwardable).toBe(false);
	});

	it("is a profile setting, on by default", async () => {
		const minh = await makeUser("minh");
		expect(await getUserById(minh)).toMatchObject({ allowMessageForwarding: true, typingIndicatorsEnabled: true });
		expect(
			await updateProfile(minh, { allowMessageForwarding: false, typingIndicatorsEnabled: false }),
		).toMatchObject({ allowMessageForwarding: false, typingIndicatorsEnabled: false });
	});
});

describe("conversation sharing restriction", () => {
	it("stops anyone forwarding out of the chat, announces who changed it, and lifts cleanly", async () => {
		const { minh, an, conversationId } = await direct();
		const elsewhere = await createConversation(an, { participantIds: [await makeUser("binh")] });
		const theirs = await sendMessage(minh, conversationId, { content: "between us" });
		const mine = await sendMessage(an, conversationId, { content: "mine too" });
		fakeIO.emits.length = 0;

		const updated = await setConversationSharingRestriction(an, conversationId, { isRestricted: true });
		expect(updated.isSharingRestricted).toBe(true);
		expect((emitsOf("message:new")[0]?.payload as MessageDTO).content).toBe(
			"an turned off forwarding in this chat",
		);
		expect(emitsOf("conversation:updated")[0]?.payload).toMatchObject({ isSharingRestricted: true });

		// The chat's rule rides on the conversation, which changes live; each message's
		// own flag keeps describing only its author's choice.
		const history = await listMessages(an, conversationId, { limit: 10 });
		expect(history.find((message) => message.id === theirs.id)?.isForwardable).toBe(true);
		for (const source of [theirs, mine]) {
			await expect(sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: source.id })).rejects.toThrow(
				"Forwarding is turned off in this chat",
			);
		}

		fakeIO.emits.length = 0;
		await setConversationSharingRestriction(an, conversationId, { isRestricted: true });
		expect(fakeIO.emits).toHaveLength(0);

		await setConversationSharingRestriction(minh, conversationId, { isRestricted: false });
		expect((await sendMessage(an, elsewhere.id, { content: "", forwardOfMessageId: theirs.id })).content).toBe(
			"between us",
		);
	});

	it("is admin-only in a group", async () => {
		const minh = await makeUser("minh");
		const an = await makeUser("an");
		const binh = await makeUser("binh");
		const group = await createConversation(minh, { participantIds: [an, binh], name: "Team" });

		await expect(setConversationSharingRestriction(an, group.id, { isRestricted: true })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		expect(
			(await setConversationSharingRestriction(minh, group.id, { isRestricted: true })).isSharingRestricted,
		).toBe(true);
	});
});
