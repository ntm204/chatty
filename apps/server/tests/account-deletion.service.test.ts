import { access } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { UnauthorizedError } from "../src/lib/errors.js";
import { userRoom } from "../src/lib/socket-bus.js";
import { prisma } from "../src/lib/prisma.js";
import { createConversation, listConversationsForUser } from "../src/modules/conversations/conversations.service.js";
import { listMessages, sendMessage } from "../src/modules/messages/messages.service.js";
import { deleteAccount, setAvatar } from "../src/modules/users/users.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const PASSWORD = "SuperSecret123";

/** One hash for the whole file — bcrypt at cost 12 is ~300ms a call. */
const passwordHash = await bcrypt.hash(PASSWORD, 12);

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/**
 * A real hash here, unlike the group tests: every test in this file goes through
 * `deleteAccount`, which will not act without the current password.
 */
async function createUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: {
			email: `${name}@chatty.test`,
			handle: `${name}_test`,
			displayName: name,
			passwordHash,
		},
		select: { id: true },
	});

	return user.id;
}

async function createGroup(creatorId: string, otherIds: string[]) {
	if (otherIds.length < 2) throw new Error("createGroup needs at least two other participants to be a real group");

	return createConversation(creatorId, { participantIds: otherIds, name: "Group" });
}

async function systemLines(conversationId: string): Promise<string[]> {
	const messages = await prisma.message.findMany({
		where: { conversationId, kind: "SYSTEM" },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: { content: true },
	});

	return messages.map((message) => message.content);
}

describe("deleteAccount", () => {
	it("refuses without the current password", async () => {
		const minhId = await createUser("minh");

		await expect(deleteAccount(minhId, { currentPassword: "not-the-password" })).rejects.toBeInstanceOf(
			UnauthorizedError,
		);

		expect(await prisma.user.count({ where: { id: minhId } })).toBe(1);
	});

	it("removes the account, its memberships and its pending tokens", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		await createConversation(minhId, { participantIds: [anId] });
		await prisma.passwordResetToken.create({
			data: { userId: minhId, tokenHash: "hash", expiresAt: new Date(Date.now() + 60_000) },
		});
		await prisma.emailChangeToken.create({
			data: {
				userId: minhId,
				newEmail: "elsewhere@chatty.test",
				tokenHash: "other-hash",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		expect(await prisma.user.count({ where: { id: minhId } })).toBe(0);
		expect(await prisma.conversationParticipant.count({ where: { userId: minhId } })).toBe(0);
		// Both cascade. A live reset link outliving the account it opens would be a
		// key to a door that has been rebuilt for somebody else.
		expect(await prisma.passwordResetToken.count()).toBe(0);
		expect(await prisma.emailChangeToken.count()).toBe(0);
	});

	it("ends every session that was open", async () => {
		const minhId = await createUser("minh");

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		// The token stops working on its next request because `requireAuth` reads
		// the user row — but a socket authenticated an hour ago is already past
		// that gate and has to be closed explicitly.
		expect(fakeIO.disconnects).toContain(userRoom(minhId));
	});

	it("leaves the messages in place, with the author taken off them", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);
		const message = await sendMessage(minhId, group.id, { content: "half of a conversation" });

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		// The text stays: deleting it would empty other people's conversations, and
		// hard-deleting the row would break the read markers and paging cursors
		// pointing at it — the same argument that made a message delete a tombstone.
		const surviving = await prisma.message.findUniqueOrThrow({
			where: { id: message.id },
			select: { content: true, kind: true, authorId: true },
		});
		expect(surviving).toEqual({ content: "half of a conversation", kind: "USER", authorId: null });

		// And it is still a USER message on the wire, with no author — which is what
		// the client renders as "Deleted account" rather than as a system line.
		// Found by id rather than by position: the departure and hand-over lines are
		// newer, and `listMessages` returns newest first.
		const visible = (await listMessages(anId, group.id, { limit: 50 })).find(
			(candidate) => candidate.id === message.id,
		);
		expect(visible).toMatchObject({ kind: "user", author: null, content: "half of a conversation" });
	});

	it("still counts an orphaned message as unread", async () => {
		// The regression the `kind`-based filter exists to prevent: unread used to
		// read a null author as "system message, do not count", which after this
		// feature would silently stop counting everyone who ever left.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "unread by an" });

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		const seenByAn = (await listConversationsForUser(anId)).items;
		expect(seenByAn[0]!.unreadCount).toBe(1);
	});

	it("hands over the groups they administered and says so in the log", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		// The database refuses a non-empty group with no admin, so this is not a
		// nicety — without the hand-over the whole delete would fail.
		const admins = await prisma.conversationParticipant.findMany({
			where: { conversationId: group.id, role: "ADMIN" },
			select: { userId: true },
		});
		expect(admins).toEqual([{ userId: anId }]);
		expect(await systemLines(group.id)).toEqual(["minh deleted their account", "an is now a group admin"]);
	});

	it("leaves a group it did not administer with its admin intact", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await deleteAccount(binhId, { currentPassword: PASSWORD });

		const admins = await prisma.conversationParticipant.findMany({
			where: { conversationId: group.id, role: "ADMIN" },
			select: { userId: true },
		});
		expect(admins).toEqual([{ userId: minhId }]);
		expect(await systemLines(group.id)).toEqual(["binh deleted their account"]);
	});

	it("deletes the avatar file, which nothing else ever had reason to", async () => {
		const minhId = await createUser("minh");
		const upload = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } })
			.png()
			.toBuffer();
		await setAvatar(minhId, upload);
		const avatarPath = path.resolve(env.UPLOAD_DIR, "avatars", `${minhId}.webp`);
		await expect(access(avatarPath)).resolves.toBeUndefined();

		await deleteAccount(minhId, { currentPassword: PASSWORD });

		await expect(access(avatarPath)).rejects.toThrow();
	});
});
