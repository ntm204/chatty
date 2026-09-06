import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	addParticipant,
	createConversation,
	listConversationsForUser,
	removeParticipant,
	renameConversation,
	setGroupInvitePolicy,
	setParticipantRole,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/** Direct fixture rows keep this permission suite about permissions, not bcrypt. */
async function createUser(name: string): Promise<string> {
	return (
		await prisma.user.create({
			data: {
				email: `${name}@chatty.test`,
				handle: `${name}_test`,
				displayName: name,
				passwordHash: "not-a-real-hash",
			},
			select: { id: true },
		})
	).id;
}

async function createGroup(creatorId: string, participantIds: string[]) {
	if (participantIds.length < 2)
		throw new Error("createGroup needs at least two other participants to be a real group");

	return createConversation(creatorId, { participantIds, name: "Trust controls" });
}

async function conversationFor(userId: string, conversationId: string) {
	const conversation = (await listConversationsForUser(userId)).items.find((item) => item.id === conversationId);
	if (!conversation) throw new Error("conversation missing from fixture");

	return conversation;
}

describe("group admins — symmetric, per ADR 0021", () => {
	it("lets any admin promote and demote another, with idempotent role writes", async () => {
		const creatorId = await createUser("creator");
		const memberId = await createUser("member");
		const otherMemberId = await createUser("other_member");
		const group = await createGroup(creatorId, [memberId, otherMemberId]);

		await setParticipantRole(creatorId, group.id, memberId, { role: "admin" });
		fakeIO.emits.length = 0;
		await setParticipantRole(creatorId, group.id, memberId, { role: "admin" });
		expect(fakeIO.emits).toHaveLength(0);
		expect((await conversationFor(creatorId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: memberId, role: "admin" }),
		);
		await expect(
			prisma.message.count({
				where: { conversationId: group.id, kind: "SYSTEM", content: { contains: "an admin" } },
			}),
		).resolves.toBe(1);

		// The newly promoted admin demotes the creator right back — symmetric,
		// nobody is senior to anybody else.
		await setParticipantRole(memberId, group.id, creatorId, { role: "member" });
		expect((await conversationFor(memberId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: creatorId, role: "member" }),
		);
	});

	it("lets an admin rename, remove ordinary members, and remove another admin", async () => {
		const creatorId = await createUser("creator");
		const otherAdminId = await createUser("other_admin");
		const memberId = await createUser("member");
		const group = await createGroup(creatorId, [otherAdminId, memberId]);
		await setParticipantRole(creatorId, group.id, otherAdminId, { role: "admin" });

		await renameConversation(otherAdminId, group.id, { name: "Admin maintained" });
		await removeParticipant(otherAdminId, group.id, memberId);
		// No hierarchy left to enforce: an admin may remove another admin too.
		await removeParticipant(otherAdminId, group.id, creatorId);

		const updated = await conversationFor(otherAdminId, group.id);
		expect(updated.name).toBe("Admin maintained");
		expect(updated.participants.map((participant) => participant.id)).toEqual([otherAdminId]);
	});

	it("keeps role changes admin-only", async () => {
		const creatorId = await createUser("creator");
		const memberId = await createUser("member");
		const otherMemberId = await createUser("other_member");
		const group = await createGroup(creatorId, [memberId, otherMemberId]);

		await expect(setParticipantRole(memberId, group.id, otherMemberId, { role: "admin" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("auto-promotes the longest-standing remaining member when the last admin leaves", async () => {
		const creatorId = await createUser("creator");
		const olderMemberId = await createUser("older");
		const newerMemberId = await createUser("newer");
		const group = await createGroup(creatorId, [olderMemberId, newerMemberId]);

		await removeParticipant(creatorId, group.id, creatorId);

		expect((await conversationFor(olderMemberId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: olderMemberId, role: "admin" }),
		);
		expect((await conversationFor(olderMemberId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: newerMemberId, role: "member" }),
		);
	});

	it("promotes nobody when another admin already remains", async () => {
		const creatorId = await createUser("creator");
		const otherAdminId = await createUser("other_admin");
		const memberId = await createUser("member");
		const group = await createGroup(creatorId, [otherAdminId, memberId]);
		await setParticipantRole(creatorId, group.id, otherAdminId, { role: "admin" });

		await removeParticipant(creatorId, group.id, creatorId);

		expect((await conversationFor(otherAdminId, group.id)).participants).toContainEqual(
			expect.objectContaining({ id: memberId, role: "member" }),
		);
		await expect(
			prisma.message.count({
				where: { conversationId: group.id, kind: "SYSTEM", content: { contains: "is now a group admin" } },
			}),
		).resolves.toBe(0);
	});

	it("keeps administration roles out of direct conversations at the database boundary", async () => {
		const firstId = await createUser("first");
		const secondId = await createUser("second");
		const direct = await createConversation(firstId, { participantIds: [secondId] });

		await expect(
			prisma.conversationParticipant.update({
				where: { conversationId_userId: { conversationId: direct.id, userId: firstId } },
				data: { role: "ADMIN" },
			}),
		).rejects.toThrow(/cannot have an admin/);
	});
});

describe("group invite policy", () => {
	it("defaults to everyone, then lets only admins invite once tightened", async () => {
		const creatorId = await createUser("creator");
		const otherAdminId = await createUser("other_admin");
		const memberId = await createUser("member");
		const firstInviteId = await createUser("first_invite");
		const secondInviteId = await createUser("second_invite");
		const group = await createGroup(creatorId, [otherAdminId, memberId]);
		expect(group.invitePolicy).toBe("everyone");
		await setParticipantRole(creatorId, group.id, otherAdminId, { role: "admin" });

		await setGroupInvitePolicy(creatorId, group.id, { invitePolicy: "managers" });
		await expect(addParticipant(memberId, group.id, { userId: firstInviteId })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		// Either admin may invite — symmetric, not just whoever set the policy.
		await addParticipant(otherAdminId, group.id, { userId: secondInviteId });

		const updated = await conversationFor(creatorId, group.id);
		expect(updated.invitePolicy).toBe("managers");
		expect(updated.participants.map((participant) => participant.id)).toContain(secondInviteId);
		expect(fakeIO.emits).toContainEqual(
			expect.objectContaining({
				event: "conversation:updated",
				payload: expect.objectContaining({ invitePolicy: "managers" }),
			}),
		);
	});

	it("keeps invite-policy changes admin-only and idempotent", async () => {
		const creatorId = await createUser("creator");
		const memberId = await createUser("member");
		const otherMemberId = await createUser("other_member");
		const group = await createGroup(creatorId, [memberId, otherMemberId]);

		await expect(setGroupInvitePolicy(memberId, group.id, { invitePolicy: "managers" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
		await setGroupInvitePolicy(creatorId, group.id, { invitePolicy: "managers" });
		fakeIO.emits.length = 0;
		await setGroupInvitePolicy(creatorId, group.id, { invitePolicy: "managers" });
		expect(fakeIO.emits).toHaveLength(0);
		await expect(
			prisma.message.count({
				where: { conversationId: group.id, kind: "SYSTEM", content: { contains: "changed group invites" } },
			}),
		).resolves.toBe(1);
	});
});
