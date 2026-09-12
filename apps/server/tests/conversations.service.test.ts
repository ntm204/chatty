import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { userRoom } from "../src/lib/socket-bus.js";
import { sendMessage, listMessages } from "../src/modules/messages/messages.service.js";
import {
	createConversation,
	listConversationsForUser,
	setConversationArchived,
	setConversationMuted,
	setConversationPinned,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

describe("per-participant conversation organisation", () => {
	it("archives only the caller's row and announces it only to that user's room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		fakeIO.emits.length = 0;

		await setConversationArchived(minhId, conversation.id, { archived: true });

		await expect(listConversationsForUser(minhId)).resolves.toEqual({ items: [], hasMore: false });
		expect((await listConversationsForUser(minhId, { isArchived: true })).items[0]?.id).toBe(conversation.id);
		expect((await listConversationsForUser(anId)).items[0]?.isArchived).toBe(false);
		expect(fakeIO.emits).toContainEqual({
			room: userRoom(minhId),
			event: "conversation:self-updated",
			payload: expect.objectContaining({ conversationId: conversation.id, isArchived: true }),
		});
		expect(fakeIO.emits.some((emit) => emit.room === userRoom(anId))).toBe(false);
	});

	it("pinning an archived conversation restores it to the main list", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await setConversationArchived(minhId, conversation.id, { archived: true });

		const event = await setConversationPinned(minhId, conversation.id, { pinned: true });

		expect(event).toMatchObject({ isPinned: true, isArchived: false });
		expect((await listConversationsForUser(minhId)).items[0]?.id).toBe(conversation.id);
	});

	it("refuses a sixth pinned conversation", async () => {
		const minhId = await createUser("minh");
		for (let index = 0; index < 5; index += 1) {
			const peerId = await createUser(`peer${String(index)}`);
			const conversation = await createConversation(minhId, { participantIds: [peerId] });
			await setConversationPinned(minhId, conversation.id, { pinned: true });
		}
		const lastPeerId = await createUser("lastpeer");
		const sixth = await createConversation(minhId, { participantIds: [lastPeerId] });

		await expect(setConversationPinned(minhId, sixth.id, { pinned: true })).rejects.toThrow(
			"You can pin up to 5 conversations",
		);
	});

	it("stores mute expiry on the caller without changing the other participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const until = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

		await setConversationMuted(minhId, conversation.id, { until });

		expect((await listConversationsForUser(minhId)).items[0]?.mutedUntil).toBe(until);
		expect((await listConversationsForUser(anId)).items[0]?.mutedUntil).toBeNull();
	});

	it("orders pinned rows first, then leaves ordinary rows in activity order", async () => {
		const minhId = await createUser("minh");
		const firstPeerId = await createUser("firstpeer");
		const secondPeerId = await createUser("secondpeer");
		const oldConversation = await createConversation(minhId, { participantIds: [firstPeerId] });
		const activeConversation = await createConversation(minhId, { participantIds: [secondPeerId] });
		await prisma.conversation.update({
			where: { id: oldConversation.id },
			data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
		});
		await prisma.conversation.update({
			where: { id: activeConversation.id },
			data: { updatedAt: new Date("2026-02-01T00:00:00.000Z") },
		});

		expect((await listConversationsForUser(minhId)).items.map((item) => item.id)).toEqual([
			activeConversation.id,
			oldConversation.id,
		]);

		await setConversationPinned(minhId, oldConversation.id, { pinned: true });
		expect((await listConversationsForUser(minhId)).items.map((item) => item.id)).toEqual([
			oldConversation.id,
			activeConversation.id,
		]);
	});
});

/** Creates a user and returns their id, so tests read as intent rather than setup. */
/**
 * Created directly with `prisma` rather than through `register()`: none of
 * this file exercises authentication, and bcrypt's ~300ms per call adds up —
 * one test here creates seven users, which was enough on its own to push that
 * test past the 5s default `testTimeout` (see the warning in `tests/setup.ts`).
 */
async function createUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			// Suffixed so short names like "an" still clear the 3-character minimum.
			handle: `${name}_test`,
			displayName: name,
			passwordHash: "x",
		},
		select: { id: true },
	});

	return user.id;
}

describe("createConversation", () => {
	it("creates a direct conversation with both participants", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(conversation.isGroup).toBe(false);
		expect(conversation.participants.map((participant) => participant.id).sort()).toEqual([minhId, anId].sort());
		expect(conversation.lastMessage).toBeNull();
	});

	it("reuses the existing direct conversation instead of creating a duplicate", async () => {
		// Otherwise "message An" from two screens splits the history in two.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const first = await createConversation(minhId, { participantIds: [anId] });
		const second = await createConversation(anId, { participantIds: [minhId] });

		expect(second.id).toBe(first.id);
	});

	it("serializes simultaneous direct conversation creation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const [first, second] = await Promise.all([
			createConversation(minhId, { participantIds: [anId] }),
			createConversation(anId, { participantIds: [minhId] }),
		]);

		expect(second.id).toBe(first.id);
		await expect(
			prisma.conversation.count({
				where: {
					isGroup: false,
					AND: [{ participants: { some: { userId: minhId } } }, { participants: { some: { userId: anId } } }],
				},
			}),
		).resolves.toBe(1);
	});

	it("creates a group when there is more than one other participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const conversation = await createConversation(minhId, {
			participantIds: [anId, binhId],
			name: "Team",
		});

		expect(conversation.isGroup).toBe(true);
		expect(conversation.name).toBe("Team");
		expect(conversation.participants).toHaveLength(3);
	});

	it("does not deduplicate groups — the same people may want several", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const first = await createConversation(minhId, { participantIds: [anId, binhId], name: "Work" });
		const second = await createConversation(minhId, { participantIds: [anId, binhId], name: "Football" });

		expect(second.id).not.toBe(first.id);
	});

	it("ignores the caller's own id when the client includes it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId, minhId] });

		expect(conversation.isGroup).toBe(false);
		expect(conversation.participants).toHaveLength(2);
	});

	it("creates one personal conversation even when opened concurrently", async () => {
		const minhId = await createUser("minh");
		const [first, second] = await Promise.all([
			createConversation(minhId, { participantIds: [minhId] }),
			createConversation(minhId, { participantIds: [minhId] }),
		]);
		expect(first.id).toBe(second.id);
		expect(first.isGroup).toBe(false);
		expect(first.participants.map((participant) => participant.id)).toEqual([minhId]);
		const note = await sendMessage(minhId, first.id, { content: "A private note" });
		expect(note.content).toBe("A private note");
		const strangerId = await createUser("stranger");
		await expect(listMessages(strangerId, first.id, { limit: 20 })).rejects.toThrow();
	});

	it("throws NotFoundError when a participant does not exist", async () => {
		const minhId = await createUser("minh");

		await expect(createConversation(minhId, { participantIds: ["ghost-id"] })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("subscribes every participant's live sockets to the new room", async () => {
		// Sockets join their rooms at connect time. Someone already online when the
		// conversation is created would otherwise sit in a chat that never updates.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(fakeIO.joins).toEqual(
			expect.arrayContaining([
				{ fromRoom: userRoom(minhId), joinedRoom: conversation.id },
				{ fromRoom: userRoom(anId), joinedRoom: conversation.id },
			]),
		);
	});

	it("announces conversation:new to every participant's personal room", async () => {
		// Joining the room is not enough: a brand-new conversation has no messages,
		// so nothing would ever be broadcast into it and it would stay invisible.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const conversation = await createConversation(minhId, { participantIds: [anId] });

		expect(fakeIO.emits).toEqual(
			expect.arrayContaining([
				{ room: userRoom(minhId), event: "conversation:new", payload: conversation },
				{ room: userRoom(anId), event: "conversation:new", payload: conversation },
			]),
		);
	});

	it("does not announce again when an existing direct conversation is reused", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await createConversation(minhId, { participantIds: [anId] });

		fakeIO.emits.length = 0;
		await createConversation(anId, { participantIds: [minhId] });

		expect(fakeIO.emits).toEqual([]);
	});

	it("does not re-subscribe when an existing direct conversation is reused", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await createConversation(minhId, { participantIds: [anId] });

		fakeIO.joins.length = 0;
		await createConversation(anId, { participantIds: [minhId] });

		// The room was joined when it was first created; both are already in it.
		expect(fakeIO.joins).toEqual([]);
	});
});

describe("listConversationsForUser", () => {
	it("returns only conversations the user belongs to", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const mine = await createConversation(minhId, { participantIds: [anId] });
		await createConversation(anId, { participantIds: [binhId] });

		const conversations = (await listConversationsForUser(minhId)).items;

		expect(conversations.map((conversation) => conversation.id)).toEqual([mine.id]);
	});

	it("returns an empty list for a user with no conversations", async () => {
		const minhId = await createUser("minh");

		await expect(listConversationsForUser(minhId)).resolves.toEqual({ items: [], hasMore: false });
	});

	it("shows a contact's last seen when their privacy allows contacts", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const lastSeenAt = new Date("2026-08-29T08:00:00.000Z");
		await prisma.user.update({ where: { id: anId }, data: { lastSeenAt, presenceVisibility: "CONTACTS" } });
		await createConversation(minhId, { participantIds: [anId] });

		const [conversation] = (await listConversationsForUser(minhId)).items;
		const an = conversation!.participants.find((participant) => participant.id === anId);
		expect(an!.lastSeenAt).toBe(lastSeenAt.toISOString());
	});

	it("hides a contact's last seen when they choose nobody", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await prisma.user.update({
			where: { id: anId },
			data: { lastSeenAt: new Date("2026-08-29T08:00:00.000Z"), presenceVisibility: "NOBODY" },
		});
		await createConversation(minhId, { participantIds: [anId] });

		const [conversation] = (await listConversationsForUser(minhId)).items;
		const an = conversation!.participants.find((participant) => participant.id === anId);
		expect(an!.lastSeenAt).toBeNull();
	});
});
