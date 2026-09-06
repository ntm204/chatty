import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	addParticipant,
	createConversation,
	listConversationsForUser,
	removeParticipant,
	renameConversation,
} from "../src/modules/conversations/conversations.service.js";
import { sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/**
 * Creates a user directly, and deliberately not through `register()`.
 *
 * These tests are about group membership; nothing in them signs in. `register()`
 * hashes with bcrypt at cost 12 — roughly 300ms each — and this file needs three
 * or four users in every one of its twenty-odd tests. That was about half a
 * minute of pure CPU spent on fixtures, and it pushed the slowest tests past
 * Vitest's default 5s `testTimeout`.
 *
 * The failure that causes is worth knowing about, because it does not look like
 * a timeout: Vitest abandons the test but its promise chain keeps running, so
 * the *next* test's `TRUNCATE` in tests/setup.ts wipes the tables mid-flight.
 * The visible symptom was "user does not exist" and "email already registered"
 * errors scattered across files that had nothing to do with this one.
 */
async function createUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			// Suffixed so short names like "an" still clear the 3-character minimum.
			handle: `${name}_test`,
			displayName: name,
			// Deliberately not a valid bcrypt hash: no test here authenticates, and
			// producing a real one is the cost this helper exists to avoid.
			passwordHash: "not-a-real-hash",
		},
		select: { id: true },
	});

	return user.id;
}

/** Finds one conversation in a user's list, so assertions can read its per-viewer fields. */
async function conversationAsSeenBy(userId: string, conversationId: string) {
	const conversations = (await listConversationsForUser(userId)).items;
	const conversation = conversations.find((candidate) => candidate.id === conversationId);
	if (!conversation) throw new Error("conversation not in the user's list");

	return conversation;
}

/**
 * `createConversation` only sets `isGroup: true` for more than one other
 * participant, so every fixture here needs at least two — a helper with one
 * "other" id would silently build a direct conversation instead.
 */
async function createGroup(creatorId: string, otherIds: string[], name = "Group") {
	if (otherIds.length < 2) throw new Error("createGroup needs at least two other participants to be a real group");

	return createConversation(creatorId, { participantIds: otherIds, name });
}

/**
 * The system lines written into a conversation, oldest first.
 *
 * Ordered by id as well as time because two of these can land in the same
 * millisecond — the last admin leaving writes the departure line and the
 * succession line back to back — and `createdAt` alone would then be free to
 * return them in either order. A cuid embeds a counter after its timestamp, so
 * it breaks that tie the same way the writes happened.
 */
async function systemLines(conversationId: string): Promise<string[]> {
	const messages = await prisma.message.findMany({
		where: { conversationId, kind: "SYSTEM" },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: { content: true, authorId: true },
	});

	// Nobody wrote a system message; an authorId on one would mean it renders
	// with a face and a bubble in the message list.
	for (const message of messages) expect(message.authorId).toBeNull();

	return messages.map((message) => message.content);
}

const SYSTEM_MESSAGE_FAILURE_CONSTRAINT = "Message_reject_system_messages_for_atomicity_test";

async function rejectSystemMessages(predicate = `"kind" <> 'SYSTEM'`): Promise<void> {
	await prisma.$executeRawUnsafe(
		`ALTER TABLE "Message" ADD CONSTRAINT "${SYSTEM_MESSAGE_FAILURE_CONSTRAINT}" CHECK (${predicate});`,
	);
}

async function allowSystemMessages(): Promise<void> {
	await prisma.$executeRawUnsafe(
		`ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "${SYSTEM_MESSAGE_FAILURE_CONSTRAINT}";`,
	);
}

describe("addParticipant", () => {
	it("adds a new member to the participant list", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await addParticipant(minhId, group.id, { userId: chiId });

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id).sort()).toEqual(
			[minhId, anId, binhId, chiId].sort(),
		);
	});

	it("joins the new member's live sockets to the conversation room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.joins.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		expect(fakeIO.joins).toContainEqual({ fromRoom: `user:${chiId}`, joinedRoom: group.id });
	});

	it("sends conversation:new to the new member, fixing the gap where it only fired on creation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		const newMemberEmit = fakeIO.emits.find(
			(emit) => emit.room === `user:${chiId}` && emit.event === "conversation:new",
		);
		expect(newMemberEmit).toBeDefined();
		expect((newMemberEmit?.payload as { id: string }).id).toBe(group.id);
	});

	it("broadcasts conversation:updated to the room, without any per-viewer field", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		const updatedEmit = fakeIO.emits.find(
			(emit) => emit.room === group.id && emit.event === "conversation:updated",
		);
		expect(updatedEmit).toBeDefined();
		const payload = updatedEmit?.payload as Record<string, unknown>;
		// A payload where one recipient's unread count could leak into everyone
		// else's view must never be broadcast to a whole room — see the type's
		// own doc comment in shared-types for why.
		expect(payload).not.toHaveProperty("unreadCount");
		expect(payload).not.toHaveProperty("lastMessage");
		expect((payload.participants as { id: string }[]).map((participant) => participant.id)).toContain(chiId);
	});

	it("rejects adding to a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(addParticipant(minhId, direct.id, { userId: binhId })).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects a user id that does not exist", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(minhId, group.id, { userId: "cm0000000000000000000000" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("rejects someone who is already a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(minhId, group.id, { userId: anId })).rejects.toBeInstanceOf(ConflictError);
	});

	it("turns two simultaneous adds into one success and one domain conflict", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		const results = await Promise.allSettled([
			addParticipant(minhId, group.id, { userId: chiId }),
			addParticipant(anId, group.id, { userId: chiId }),
		]);

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toEqual([
			expect.objectContaining({ reason: expect.any(ConflictError) }),
		]);
		await expect(
			prisma.conversationParticipant.count({ where: { conversationId: group.id, userId: chiId } }),
		).resolves.toBe(1);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const outsiderId = await createUser("duc");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(addParticipant(outsiderId, group.id, { userId: chiId })).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("removeParticipant", () => {
	it("removes another member from the participant list (a kick)", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, binhId);

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("lets a participant remove themselves (leaving)", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(binhId, group.id, binhId);

		const seenByMinh = await conversationAsSeenBy(minhId, group.id);
		expect(seenByMinh.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("evicts the removed member's sockets from the conversation room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.leaves.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		expect(fakeIO.leaves).toContainEqual({ fromRoom: `user:${binhId}`, leftRoom: group.id });
	});

	it("sends conversation:left to the removed member's personal room", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		expect(fakeIO.emits).toContainEqual({
			room: `user:${binhId}`,
			event: "conversation:left",
			payload: { conversationId: group.id },
		});
	});

	it("broadcasts conversation:updated with the reduced participant list", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await removeParticipant(minhId, group.id, binhId);

		const updatedEmit = fakeIO.emits.find(
			(emit) => emit.room === group.id && emit.event === "conversation:updated",
		);
		const payload = updatedEmit?.payload as { participants: { id: string }[] };
		expect(payload.participants.map((participant) => participant.id)).not.toContain(binhId);
	});

	it("rejects removing from a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(removeParticipant(minhId, direct.id, anId)).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects removing someone who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(removeParticipant(minhId, group.id, outsiderId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(removeParticipant(outsiderId, group.id, binhId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("allows a group to end up with zero participants", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		// `isGroup` was set once at creation and is never recomputed from a
		// headcount (see the schema comment on `Conversation.isGroup`), so it
		// stays true all the way down to zero members — nothing here should throw.
		await removeParticipant(minhId, group.id, anId);
		await removeParticipant(minhId, group.id, binhId);
		await expect(removeParticipant(minhId, group.id, minhId)).resolves.toBeUndefined();
	});
});

describe("renameConversation", () => {
	it("renames the group and returns it in the actor's own view", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Old name");

		const renamed = await renameConversation(minhId, group.id, { name: "New name" });

		expect(renamed.name).toBe("New name");
	});

	it("broadcasts conversation:updated with the new name", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Old name");

		fakeIO.emits.length = 0;
		await renameConversation(minhId, group.id, { name: "New name" });

		expect(fakeIO.emits).toContainEqual(
			expect.objectContaining({
				room: group.id,
				event: "conversation:updated",
				payload: expect.objectContaining({ name: "New name" }),
			}),
		);
	});

	it("rejects renaming a direct conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(renameConversation(minhId, direct.id, { name: "Nope" })).rejects.toBeInstanceOf(ValidationError);
	});

	it("rejects an actor who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const outsiderId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(renameConversation(outsiderId, group.id, { name: "Nope" })).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("group administration", () => {
	it("makes whoever created a group its first admin, and everyone else a member", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");

		const group = await createGroup(minhId, [anId, binhId]);

		const roles = new Map(group.participants.map((participant) => [participant.id, participant.role]));
		expect(roles.get(minhId)).toBe("admin");
		expect(roles.get(anId)).toBe("member");
		expect(roles.get(binhId)).toBe("member");
	});

	it("gives a direct conversation no admin at all", async () => {
		// Two people have nothing to administer between them, and an admin there
		// would only be a role the UI has to remember not to show.
		const minhId = await createUser("minh");
		const anId = await createUser("an");

		const direct = await createConversation(minhId, { participantIds: [anId] });

		expect(direct.participants.every((participant) => participant.role === "member")).toBe(true);
	});

	it("lets an ordinary member add someone under the open invite policy", async () => {
		// Inviting is how a group grows; gating it behind admins makes them a
		// bottleneck for the thing groups are for unless the policy asks for it.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await addParticipant(anId, group.id, { userId: chiId });

		const updated = await conversationAsSeenBy(anId, group.id);
		expect(updated.participants.map((participant) => participant.id)).toContain(chiId);
	});

	it("refuses to let a member remove somebody else", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(removeParticipant(anId, group.id, binhId)).rejects.toThrow(ForbiddenError);

		const unchanged = await conversationAsSeenBy(minhId, group.id);
		expect(unchanged.participants.map((participant) => participant.id)).toContain(binhId);
	});

	it("lets a member remove themselves", async () => {
		// The one thing the role must never block: admins who could keep people
		// in a group would be worse than a group with no admin.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(anId, group.id, anId);

		const remaining = await conversationAsSeenBy(minhId, group.id);
		expect(remaining.participants.map((participant) => participant.id)).not.toContain(anId);
	});

	it("refuses to let a member rename the group", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Weekend football");

		await expect(renameConversation(anId, group.id, { name: "Something else" })).rejects.toThrow(ForbiddenError);

		const unchanged = await conversationAsSeenBy(minhId, group.id);
		expect(unchanged.name).toBe("Weekend football");
	});

	it("hands the group to the longest-standing member when the last admin leaves", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, minhId);

		const remaining = await conversationAsSeenBy(anId, group.id);
		const admins = remaining.participants.filter((participant) => participant.role === "admin");
		// One successor, not everyone remaining: multiple admins are allowed in
		// general, but this promotion only replaces the admin who just left.
		expect(admins).toHaveLength(1);
		expect(admins[0]?.id).toBe(anId);
	});

	it("lets the newly promoted admin do what they could not do a moment ago", async () => {
		// The succession is only worth anything if the role it grants is real.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, minhId);
		await renameConversation(anId, group.id, { name: "Still on" });

		const renamed = await conversationAsSeenBy(anId, group.id);
		expect(renamed.name).toBe("Still on");
	});

	it("survives the last participant leaving, with nobody left to promote", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(anId, group.id, anId);
		await removeParticipant(binhId, group.id, binhId);
		await removeParticipant(minhId, group.id, minhId);

		await expect(prisma.conversationParticipant.count({ where: { conversationId: group.id } })).resolves.toBe(0);
	});

	it("serialises the last admin and their likely successor leaving at the same time", async () => {
		// Without the conversation row lock, the departing admin can select `an`
		// for promotion while the other request deletes `an`, leaving `binh` alone
		// and adminless.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await Promise.all([removeParticipant(minhId, group.id, minhId), removeParticipant(anId, group.id, anId)]);

		const remaining = await conversationAsSeenBy(binhId, group.id);
		expect(remaining.participants).toEqual([expect.objectContaining({ id: binhId, role: "admin" })]);
	});

	it("has a database constraint against demoting the only admin", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(
			prisma.conversationParticipant.update({
				where: { conversationId_userId: { conversationId: group.id, userId: minhId } },
				data: { role: "MEMBER" },
			}),
		).rejects.toThrow(/at least one admin/);

		const unchanged = await conversationAsSeenBy(minhId, group.id);
		expect(unchanged.participants.find((participant) => participant.id === minhId)?.role).toBe("admin");
	});

	it("allows more than one admin at once", async () => {
		// The old model refused a second OWNER; the flattened one has no reason to
		// refuse a second, third, or fourth ADMIN — none of them is senior.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await prisma.conversationParticipant.update({
			where: { conversationId_userId: { conversationId: group.id, userId: anId } },
			data: { role: "ADMIN" },
		});

		await expect(
			prisma.conversationParticipant.count({ where: { conversationId: group.id, role: "ADMIN" } }),
		).resolves.toBe(2);
	});

	it("has a database constraint against giving a direct conversation an admin", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(
			prisma.conversationParticipant.update({
				where: { conversationId_userId: { conversationId: direct.id, userId: minhId } },
				data: { role: "ADMIN" },
			}),
		).rejects.toThrow(/cannot have an admin/);
	});
});

describe("atomic group mutations", () => {
	it("rolls an add back and emits nothing when its system message cannot be written", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);
		fakeIO.emits.length = 0;
		fakeIO.joins.length = 0;

		await rejectSystemMessages();
		try {
			await expect(addParticipant(minhId, group.id, { userId: chiId })).rejects.toThrow();
		} finally {
			await allowSystemMessages();
		}

		expect(
			await prisma.conversationParticipant.findUnique({
				where: { conversationId_userId: { conversationId: group.id, userId: chiId } },
			}),
		).toBeNull();
		expect(fakeIO.joins).toHaveLength(0);
		expect(fakeIO.emits).toHaveLength(0);
	});

	it("rolls a kick back and emits nothing when its system message cannot be written", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);
		fakeIO.emits.length = 0;
		fakeIO.leaves.length = 0;

		await rejectSystemMessages();
		try {
			await expect(removeParticipant(minhId, group.id, anId)).rejects.toThrow();
		} finally {
			await allowSystemMessages();
		}

		expect(
			await prisma.conversationParticipant.findUnique({
				where: { conversationId_userId: { conversationId: group.id, userId: anId } },
			}),
		).not.toBeNull();
		expect(fakeIO.leaves).toHaveLength(0);
		expect(fakeIO.emits).toHaveLength(0);
	});

	it("rolls a rename back and emits nothing when its system message cannot be written", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Original");
		fakeIO.emits.length = 0;

		await rejectSystemMessages();
		try {
			await expect(renameConversation(minhId, group.id, { name: "Changed" })).rejects.toThrow();
		} finally {
			await allowSystemMessages();
		}

		await expect(
			prisma.conversation.findUnique({ where: { id: group.id }, select: { name: true } }),
		).resolves.toEqual({
			name: "Original",
		});
		expect(fakeIO.emits).toHaveLength(0);
	});

	it("rolls the whole admin hand-over back when its second system message fails", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);
		fakeIO.emits.length = 0;
		fakeIO.leaves.length = 0;

		await rejectSystemMessages(`"kind" <> 'SYSTEM' OR "content" NOT LIKE '% is now a group admin'`);
		try {
			await expect(removeParticipant(minhId, group.id, minhId)).rejects.toThrow();
		} finally {
			await allowSystemMessages();
		}

		const unchanged = await conversationAsSeenBy(minhId, group.id);
		expect(unchanged.participants.find((participant) => participant.id === minhId)?.role).toBe("admin");
		await expect(systemLines(group.id)).resolves.toEqual([]);
		expect(fakeIO.leaves).toHaveLength(0);
		expect(fakeIO.emits).toHaveLength(0);
	});
});

describe("membership linearisation", () => {
	it("refuses a send that was waiting behind the sender's removal", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		let signalLockAcquired!: () => void;
		let releaseRemoval!: () => void;
		const lockAcquired = new Promise<void>((resolve) => {
			signalLockAcquired = resolve;
		});
		const mayCommitRemoval = new Promise<void>((resolve) => {
			releaseRemoval = resolve;
		});

		const removal = prisma.$transaction(async (transaction) => {
			await transaction.$queryRaw`
				SELECT id
				FROM "Conversation"
				WHERE id = ${group.id}
				FOR UPDATE
			`;
			signalLockAcquired();
			await mayCommitRemoval;
			await transaction.conversationParticipant.delete({
				where: { conversationId_userId: { conversationId: group.id, userId: anId } },
			});
		});

		await lockAcquired;
		const send = sendMessage(anId, group.id, { content: "too late" });
		releaseRemoval();
		await removal;

		await expect(send).rejects.toBeInstanceOf(NotFoundError);
		await expect(prisma.message.count({ where: { conversationId: group.id, content: "too late" } })).resolves.toBe(
			0,
		);
	});
});

describe("system messages", () => {
	it("has a database constraint refusing a system line that claims an author", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(
			prisma.message.create({
				data: { conversationId: group.id, authorId: minhId, kind: "SYSTEM", content: "wrong author" },
			}),
		).rejects.toThrow(/Message_kind_author_consistency/);
	});

	it("allows a USER message with no author, which is what a deleted account leaves", async () => {
		// The constraint used to forbid this, because until phase 13 nothing could
		// delete a user and "authorId is null" and "kind is SYSTEM" were two
		// spellings of one fact. They are not any more: the messages of a deleted
		// account stay in the conversation with nobody to point at, and `kind` is
		// what tells the two apart. Pinned here so the relaxation is deliberate
		// rather than something a later migration quietly tightens back up.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		const orphaned = await prisma.message.create({
			data: { conversationId: group.id, kind: "USER", content: "written by someone since deleted" },
			select: { id: true, kind: true, authorId: true },
		});

		expect(orphaned).toMatchObject({ kind: "USER", authorId: null });
	});

	it("records who added whom", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		await addParticipant(minhId, group.id, { userId: chiId });

		await expect(systemLines(group.id)).resolves.toEqual(["minh added chi"]);
	});

	it("records a departure as leaving rather than as a removal", async () => {
		// Same function call as a kick, and it must not read like one in the log.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(anId, group.id, anId);

		await expect(systemLines(group.id)).resolves.toEqual(["an left the group"]);
	});

	it("records a kick with the name of whoever did it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, anId);

		await expect(systemLines(group.id)).resolves.toEqual(["minh removed an"]);
	});

	it("records a rename with the name that was chosen", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await renameConversation(minhId, group.id, { name: "Weekend football" });

		await expect(systemLines(group.id)).resolves.toEqual(['minh renamed the group to "Weekend football"']);
	});

	it("records the departure before the handover when the last admin leaves", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await removeParticipant(minhId, group.id, minhId);

		await expect(systemLines(group.id)).resolves.toEqual(["minh left the group", "an is now a group admin"]);
	});

	it("broadcasts each line to the conversation as a message", async () => {
		// Written but not broadcast would mean the notice only appears on reload,
		// which is the whole thing this was added to fix.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const chiId = await createUser("chi");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		await addParticipant(minhId, group.id, { userId: chiId });

		const messageEmit = fakeIO.emits.find((emit) => emit.room === group.id && emit.event === "message:new");
		expect(messageEmit).toBeDefined();
		const payload = messageEmit?.payload as { kind: string; author: unknown; content: string };
		expect(payload.kind).toBe("system");
		expect(payload.author).toBeNull();
		expect(payload.content).toBe("minh added chi");
	});

	it("does not broadcast the departure line until the leaver has been evicted", async () => {
		// Ordering, not politeness: their sockets are still in the room until the
		// eviction lands, so a line emitted first arrives on the screen of the
		// person it is about, in a conversation they have just been told they left.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		fakeIO.emits.length = 0;
		fakeIO.leaves.length = 0;
		await removeParticipant(anId, group.id, anId);

		expect(fakeIO.leaves).toContainEqual({ fromRoom: `user:${anId}`, leftRoom: group.id });
		const messageEmitIndex = fakeIO.emits.findIndex(
			(emit) => emit.room === group.id && emit.event === "message:new",
		);
		const leftEmitIndex = fakeIO.emits.findIndex(
			(emit) => emit.room === `user:${anId}` && emit.event === "conversation:left",
		);
		// conversation:left is sent immediately after the eviction, so anything
		// after it in this list was emitted with the leaver already out of the room.
		expect(messageEmitIndex).toBeGreaterThan(leftEmitIndex);
	});

	it("keeps system lines out of the unread badge", async () => {
		// "Chi left the group" is not somebody talking to you. The count comes from
		// a query that compares authors, and a system message has none.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId], "Weekend football");

		await renameConversation(minhId, group.id, { name: "Sunday football" });

		const asSeenByAn = await conversationAsSeenBy(anId, group.id);
		expect(asSeenByAn.unreadCount).toBe(0);
		// It is still the newest thing in the conversation, so the sidebar shows it.
		expect(asSeenByAn.lastMessage?.content).toBe('minh renamed the group to "Sunday football"');
		expect(asSeenByAn.lastMessage?.kind).toBe("system");
	});
});
