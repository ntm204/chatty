import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";
import { register } from "../src/modules/auth/auth.service.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import {
	getMessageContext,
	hideMessageForUser,
	listMessages,
	deleteMessage,
	editMessage,
	removeSavedMessage,
	saveMessageForUser,
	sendMessage,
	setMessagePinned,
} from "../src/modules/messages/messages.service.js";
import {
	getConversationVaultSummary,
	listConversationLinks,
	listConversationMedia,
	listSavedMessages,
} from "../src/modules/vault/vault.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

describe("vault, forwarding, mentions, and pins", () => {
	it("extracts normalized links and returns them from the conversation vault", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = await sendMessage(minhId, conversation.id, {
			content: "Docs https://example.com/path, again https://example.com/path",
		});

		const page = await listConversationLinks(anId, conversation.id, { limit: 20 });

		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toMatchObject({ messageId: sent.id, url: "https://example.com/path" });
	});

	it("replaces vault links on edit and removes them with a tombstone", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = await sendMessage(minhId, conversation.id, { content: "https://before.example" });

		await editMessage(minhId, conversation.id, sent.id, { content: "https://after.example" });
		expect(
			(await listConversationLinks(anId, conversation.id, { limit: 20 })).items.map((item) => item.url),
		).toEqual(["https://after.example"]);

		await deleteMessage(minhId, conversation.id, sent.id);
		expect((await listConversationLinks(anId, conversation.id, { limit: 20 })).items).toEqual([]);
	});

	it("pages media without duplicates and respects delete-for-me", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: "black" } })
			.png()
			.toBuffer();
		const first = await sendMessage(minhId, conversation.id, { content: "one", attachments: [image] });
		const second = await sendMessage(minhId, conversation.id, { content: "two", attachments: [image] });
		const third = await sendMessage(minhId, conversation.id, { content: "three", attachments: [image] });
		for (const [message, createdAt] of [
			[first, "2026-01-01T00:00:00.000Z"],
			[second, "2026-01-02T00:00:00.000Z"],
			[third, "2026-01-03T00:00:00.000Z"],
		] as const) {
			await prisma.attachment.update({
				where: { id: message.attachments[0]!.id },
				data: { createdAt: new Date(createdAt) },
			});
		}

		const pageOne = await listConversationMedia(anId, conversation.id, { kind: "image", limit: 2 });
		const pageTwo = await listConversationMedia(anId, conversation.id, {
			kind: "image",
			limit: 2,
			before: pageOne.items.at(-1)!.id,
		});
		expect([...pageOne.items, ...pageTwo.items].map((item) => item.messageId)).toEqual([
			third.id,
			second.id,
			first.id,
		]);
		expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)).size).toBe(3);

		await hideMessageForUser(anId, conversation.id, second.id);
		expect(
			(await listConversationMedia(anId, conversation.id, { kind: "image", limit: 20 })).items.map(
				(item) => item.messageId,
			),
		).not.toContain(second.id);
		expect(
			(await listConversationMedia(minhId, conversation.id, { kind: "image", limit: 20 })).items.map(
				(item) => item.messageId,
			),
		).toContain(second.id);
	});

	it("stores mentions by participant id and rejects ids outside the group", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId, outsiderId], name: "Team" });

		const sent = await sendMessage(minhId, conversation.id, {
			content: "@an_test hello",
			mentionedUserIds: [anId],
		});
		expect(sent.mentionedUserIds).toEqual([anId]);

		const strangerId = await createUser("stranger");
		await expect(
			sendMessage(minhId, conversation.id, { content: "nope", mentionedUserIds: [strangerId] }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("copies forwarded attachments instead of referencing the source rows", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const sourceConversation = await createConversation(minhId, { participantIds: [anId] });
		const targetConversation = await createConversation(minhId, { participantIds: [binhId] });
		const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "black" } })
			.png()
			.toBuffer();
		const source = await sendMessage(minhId, sourceConversation.id, { content: "source", attachments: [image] });

		const forwarded = await sendMessage(minhId, targetConversation.id, {
			content: "",
			forwardOfMessageId: source.id,
		});

		expect(forwarded.isForwarded).toBe(true);
		expect(forwarded.content).toBe("source");
		expect(forwarded.attachments[0]?.id).not.toBe(source.attachments[0]?.id);
		expect(
			(await listConversationMedia(binhId, targetConversation.id, { kind: "image", limit: 20 })).items,
		).toHaveLength(1);
	});

	it("requires source membership before forwarding", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const sourceConversation = await createConversation(minhId, { participantIds: [anId] });
		const targetConversation = await createConversation(outsiderId, { participantIds: [anId] });
		const source = await sendMessage(minhId, sourceConversation.id, { content: "private" });

		await expect(
			sendMessage(outsiderId, targetConversation.id, { content: "", forwardOfMessageId: source.id }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	/**
	 * The panel's category rows are counts, and a row that says 2 and opens onto
	 * 1 is worse than a row with no number — so every count here is asserted
	 * against the list it sits in front of, hidden messages included.
	 */
	it("counts each category exactly as its own list would page it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const withLink = await sendMessage(minhId, conversation.id, { content: "read https://example.com/one" });
		await sendMessage(minhId, conversation.id, { content: "and https://example.com/two" });
		const saved = await sendMessage(minhId, conversation.id, { content: "keep this" });
		await saveMessageForUser(anId, conversation.id, saved.id);

		await expect(getConversationVaultSummary(anId, conversation.id)).resolves.toEqual({
			media: 0,
			files: 0,
			voice: 0,
			links: 2,
			saved: 1,
		});

		// Removing a message from your own view has to remove it from your counts.
		// The count and the list read the same MessageHiddenFor rows; a count that
		// skipped them would promise a link this reader can no longer reach.
		await hideMessageForUser(anId, conversation.id, withLink.id);

		const summary = await getConversationVaultSummary(anId, conversation.id);
		expect(summary.links).toBe(1);
		expect((await listConversationLinks(anId, conversation.id, { limit: 20 })).items).toHaveLength(1);
		// And it is one person's view, not the conversation's.
		await expect(getConversationVaultSummary(minhId, conversation.id)).resolves.toMatchObject({ links: 2 });
	});

	it("refuses a summary for a conversation the caller is not in", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("binh");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await expect(getConversationVaultSummary(outsiderId, conversation.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	/**
	 * The panel used to ask for the account's saved messages and filter the page
	 * in the browser, so somebody who saves things in several conversations opened
	 * this list empty and had to scroll it into existence. The cursor has to page
	 * the scoped set.
	 */
	it("scopes saved messages to one conversation, cursor included", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const here = await createConversation(minhId, { participantIds: [anId] });
		// A group, because two `createConversation` calls for the same pair
		// deliberately return the one direct conversation rather than a second.
		const elsewhere = await createConversation(minhId, { participantIds: [anId, binhId] });
		const first = await sendMessage(minhId, here.id, { content: "here one" });
		const second = await sendMessage(minhId, here.id, { content: "here two" });
		const other = await sendMessage(minhId, elsewhere.id, { content: "elsewhere" });
		for (const message of [first, second, other]) {
			await saveMessageForUser(anId, message.conversationId, message.id);
		}

		const scoped = await listSavedMessages(anId, { limit: 20, conversationId: here.id });
		expect(scoped.results.map((item) => item.message.id)).toEqual([second.id, first.id]);
		// Unscoped still means the whole account, so the parameter narrowed the
		// query rather than replacing what the list is.
		expect((await listSavedMessages(anId, { limit: 20 })).results).toHaveLength(3);

		// A page of one, then its cursor: the second page must continue inside the
		// scope rather than falling back to the account-wide list.
		const firstPage = await listSavedMessages(anId, { limit: 1, conversationId: here.id });
		expect(firstPage.results.map((item) => item.message.id)).toEqual([second.id]);
		expect(firstPage.hasMore).toBe(true);
		const secondPage = await listSavedMessages(anId, {
			limit: 1,
			conversationId: here.id,
			before: second.id,
		});
		expect(secondPage.results.map((item) => item.message.id)).toEqual([first.id]);
		expect(secondPage.hasMore).toBe(false);

		// A cursor from another conversation is not a cursor into this one.
		await expect(
			listSavedMessages(anId, { limit: 1, conversationId: here.id, before: other.id }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("saves per user and limits a conversation to three pinned messages", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const messages: Awaited<ReturnType<typeof sendMessage>>[] = [];
		for (const content of ["one", "two", "three", "four"]) {
			messages.push(await sendMessage(minhId, conversation.id, { content }));
		}

		await saveMessageForUser(anId, conversation.id, messages[0]!.id);
		expect((await listSavedMessages(anId, { limit: 20 })).results[0]?.message.id).toBe(messages[0]!.id);
		// Per viewer: An's history marks it, Minh's does not.
		const anHistory = await listMessages(anId, conversation.id, { limit: 10 });
		expect(anHistory.find((message) => message.id === messages[0]!.id)?.isBookmarked).toBe(true);
		expect(anHistory.find((message) => message.id === messages[1]!.id)?.isBookmarked).toBe(false);
		const minhHistory = await listMessages(minhId, conversation.id, { limit: 10 });
		expect(minhHistory.find((message) => message.id === messages[0]!.id)?.isBookmarked).toBe(false);
		await removeSavedMessage(anId, conversation.id, messages[0]!.id);
		expect((await listSavedMessages(anId, { limit: 20 })).results).toEqual([]);
		expect(fakeIO.emits.filter((event) => event.event === "bookmark:changed")).toEqual([
			{
				room: `user:${anId}`,
				event: "bookmark:changed",
				payload: { conversationId: conversation.id, messageId: messages[0]!.id, isBookmarked: true },
			},
			{
				room: `user:${anId}`,
				event: "bookmark:changed",
				payload: { conversationId: conversation.id, messageId: messages[0]!.id, isBookmarked: false },
			},
		]);

		for (const message of messages.slice(0, 3)) await setMessagePinned(anId, conversation.id, message.id, true);
		await expect(setMessagePinned(anId, conversation.id, messages[3]!.id, true)).rejects.toThrow(
			"at most 3 pinned messages",
		);
	});
});

/**
 * The `message:new` emits only.
 *
 * Setting up a conversation emits `conversation:new` too, so asserting on the
 * raw total made these tests fail the moment an unrelated event was added.
 * Filtering by event keeps them about what they actually check.
 */
function messageEmits() {
	return fakeIO.emits.filter((emit) => emit.event === "message:new");
}

async function createUser(name: string): Promise<string> {
	const { user } = await register({
		email: `${name}@chatty.test`,
		password: "SuperSecret123",
		// Suffixed so short names like "an" still clear the 3-character minimum.
		handle: `${name}_test`,
		displayName: name,
	});

	return user.id;
}

describe("sendMessage", () => {
	it("stores the message and returns it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const message = await sendMessage(minhId, conversation.id, { content: "Chào An" });

		expect(message.content).toBe("Chào An");
		expect(message.kind).toBe("user");
		// The whole author, not just an id: a message has to keep its name and
		// face after its writer leaves the group.
		expect(message.author?.id).toBe(minhId);
		expect(message.conversationId).toBe(conversation.id);
		await expect(prisma.message.count({ where: { conversationId: conversation.id } })).resolves.toBe(1);
	});

	it("broadcasts message:new to the conversation room", async () => {
		// Without this the message is saved but nobody's screen updates.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const message = await sendMessage(minhId, conversation.id, { content: "Chào An" });

		expect(messageEmits()).toHaveLength(1);
		expect(messageEmits()[0]).toEqual({ room: conversation.id, event: "message:new", payload: message });
	});

	it("returns the original message when a client id is replayed", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const first = await sendMessage(minhId, conversation.id, {
			content: "survives a lost response",
			clientId: "draft:72b5e54a-7e14-41da-adfd-f67030ec0c31",
		});
		const replay = await sendMessage(minhId, conversation.id, {
			content: "survives a lost response",
			clientId: "draft:72b5e54a-7e14-41da-adfd-f67030ec0c31",
		});

		expect(replay).toEqual(first);
		await expect(prisma.message.count({ where: { conversationId: conversation.id } })).resolves.toBe(1);
		// A replay is a response to this device, not new activity for every device.
		expect(messageEmits()).toHaveLength(1);
	});

	it("serialises concurrent replays into one row and one event", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const input = { content: "sent from two tabs", clientId: "draft:7c5dccb8-558f-4770-92e3-40a08695218d" };

		const [first, second] = await Promise.all([
			sendMessage(minhId, conversation.id, input),
			sendMessage(minhId, conversation.id, input),
		]);

		expect(second.id).toBe(first.id);
		await expect(prisma.message.count({ where: { conversationId: conversation.id } })).resolves.toBe(1);
		expect(messageEmits()).toHaveLength(1);
	});

	it("refuses to reuse one client id in another conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const first = await createConversation(minhId, { participantIds: [anId] });
		const second = await createConversation(minhId, { participantIds: [binhId] });
		const clientId = "draft:0626a698-858c-4908-8143-fe2f9b708dea";
		await sendMessage(minhId, first.id, { content: "first", clientId });

		await expect(sendMessage(minhId, second.id, { content: "second", clientId })).rejects.toBeInstanceOf(
			ValidationError,
		);
		await expect(prisma.message.count({ where: { authorId: minhId } })).resolves.toBe(1);
	});

	it("bumps the conversation's updatedAt so it sorts to the top", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const before = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			select: { updatedAt: true },
		});

		await sendMessage(minhId, conversation.id, { content: "Chào An" });

		const after = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			select: { updatedAt: true },
		});
		expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
	});

	it("throws NotFoundError when the sender is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await expect(sendMessage(outsiderId, conversation.id, { content: "let me in" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("does not broadcast when the sender is rejected", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await sendMessage(outsiderId, conversation.id, { content: "let me in" }).catch(() => undefined);

		expect(messageEmits()).toHaveLength(0);
	});
});

describe("listMessages", () => {
	it("returns messages newest first", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(anId, conversation.id, { content: "second" });

		const messages = await listMessages(minhId, conversation.id, { limit: 50 });

		expect(messages.map((message) => message.content)).toEqual(["second", "first"]);
	});

	it("respects the limit", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(minhId, conversation.id, { content: "second" });
		await sendMessage(minhId, conversation.id, { content: "third" });

		const messages = await listMessages(minhId, conversation.id, { limit: 2 });

		expect(messages).toHaveLength(2);
	});

	it("pages backwards from the `before` cursor, excluding the cursor itself", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(minhId, conversation.id, { content: "second" });
		await sendMessage(minhId, conversation.id, { content: "third" });

		const firstPage = await listMessages(minhId, conversation.id, { limit: 2 });
		const secondPage = await listMessages(minhId, conversation.id, {
			limit: 2,
			before: firstPage[firstPage.length - 1]!.id,
		});

		expect(firstPage.map((message) => message.content)).toEqual(["third", "second"]);
		expect(secondPage.map((message) => message.content)).toEqual(["first"]);
	});

	it("throws NotFoundError when the reader is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "private" });

		await expect(listMessages(outsiderId, conversation.id, { limit: 50 })).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("getMessageContext", () => {
	it("returns the target with messages on both sides in display order", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = [];
		for (const content of ["one", "two", "target", "four", "five"]) {
			sent.push(await sendMessage(minhId, conversation.id, { content }));
		}

		const context = await getMessageContext(minhId, conversation.id, sent[2]!.id, { limit: 5 });

		expect(context.messages.map((message) => message.content)).toEqual(["one", "two", "target", "four", "five"]);
		expect(context.hasMoreOlder).toBe(false);
		expect(context.hasMoreNewer).toBe(false);
	});

	it("reports when more history exists outside the context window", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = [];
		for (const content of ["one", "two", "target", "four", "five"]) {
			sent.push(await sendMessage(minhId, conversation.id, { content }));
		}

		const context = await getMessageContext(minhId, conversation.id, sent[2]!.id, { limit: 3 });

		expect(context.messages.map((message) => message.content)).toEqual(["two", "target", "four"]);
		expect(context.hasMoreOlder).toBe(true);
		expect(context.hasMoreNewer).toBe(true);
	});

	it("does not reveal a target to somebody outside the conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const target = await sendMessage(minhId, conversation.id, { content: "private target" });

		await expect(getMessageContext(outsiderId, conversation.id, target.id, { limit: 5 })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});
