import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
	excludeRestrictedDirectRoomIds,
	getRestrictionStatus,
	hasRestricted,
	isDirectConversationRestricted,
	listRestrictedUsers,
	listRestrictorsAmong,
	restrictUser,
	unrestrictUser,
} from "../src/modules/restrictions/restrictions.service.js";
import {
	createConversation,
	listConversationsForUser,
	markConversationRead,
} from "../src/modules/conversations/conversations.service.js";
import { sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO } from "./fake-io.js";

async function makeUser(handle: string) {
	return prisma.user.create({
		data: {
			email: `${handle}@test.com`,
			handle,
			displayName: handle,
			passwordHash: "x",
		},
		select: { id: true },
	});
}

let mai: { id: string };
let linh: { id: string };

beforeEach(async () => {
	installFakeIO();
	mai = await makeUser("mai");
	linh = await makeUser("linh");
});

describe("restricting", () => {
	it("is idempotent, and unrestricting removes it", async () => {
		await restrictUser(mai.id, linh.id);
		await expect(restrictUser(mai.id, linh.id)).resolves.toBeUndefined();
		await expect(listRestrictedUsers(mai.id, { limit: 30 })).resolves.toMatchObject({
			items: [{ id: linh.id }],
			nextCursor: null,
		});

		await unrestrictUser(mai.id, linh.id);

		await expect(listRestrictedUsers(mai.id, { limit: 30 })).resolves.toEqual({ items: [], nextCursor: null });
	});

	it("refuses to restrict yourself", async () => {
		await expect(restrictUser(mai.id, mai.id)).rejects.toThrow("You cannot restrict yourself");
	});

	it("reports only the caller's own restriction state", async () => {
		await restrictUser(mai.id, linh.id);

		await expect(getRestrictionStatus(mai.id, linh.id)).resolves.toEqual({ isRestricted: true });
		// The restricted person cannot use status as an oracle for the reverse direction.
		await expect(getRestrictionStatus(linh.id, mai.id)).resolves.toEqual({ isRestricted: false });
		await expect(hasRestricted(linh.id, mai.id)).resolves.toBe(false);
	});

	/**
	 * Told to nobody but the actor's own sessions — the same rule `block:changed`
	 * follows, for a stronger reason: an event reaching the restricted person
	 * would be the only way they could ever find out.
	 */
	it("tells the actor's other sessions, and only theirs", async () => {
		const bus = installFakeIO();
		await restrictUser(mai.id, linh.id);

		expect(bus.emits).toContainEqual({
			room: `user:${mai.id}`,
			event: "restriction:changed",
			payload: { userId: linh.id, isRestricted: true },
		});
		expect(bus.emits.filter((emit) => emit.event === "restriction:changed").map((emit) => emit.room)).toEqual([
			`user:${mai.id}`,
		]);
	});

	it("pages the restriction list with a stable cursor", async () => {
		const binh = await makeUser("binh");
		const chi = await makeUser("chi");
		await restrictUser(mai.id, linh.id);
		await restrictUser(mai.id, binh.id);
		await restrictUser(mai.id, chi.id);

		const first = await listRestrictedUsers(mai.id, { limit: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).not.toBeNull();

		const second = await listRestrictedUsers(mai.id, { limit: 2, before: first.nextCursor! });
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
		expect(new Set([...first.items, ...second.items].map((user) => user.id))).toEqual(
			new Set([linh.id, binh.id, chi.id]),
		);
	});

	it("leaves a group both of them are in exempt", async () => {
		const binh = await makeUser("binh");
		const group = await createConversation(mai.id, { participantIds: [linh.id, binh.id] });
		await restrictUser(mai.id, linh.id);

		await expect(isDirectConversationRestricted(mai.id, group.id)).resolves.toBe(false);
	});

	it("still lets messages through — nothing is refused", async () => {
		const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
		await restrictUser(mai.id, linh.id);

		await expect(sendMessage(linh.id, conversation.id, { content: "still delivered" })).resolves.toBeTruthy();
	});

	describe("unread badge", () => {
		it("stops counting messages from someone the reader has restricted", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
			await restrictUser(mai.id, linh.id);

			await sendMessage(linh.id, conversation.id, { content: "hello" });

			const conversations = (await listConversationsForUser(mai.id)).items;
			const found = conversations.find((candidate) => candidate.id === conversation.id);
			expect(found?.unreadCount).toBe(0);
		});

		it("keeps counting the restricted person's messages in a shared group", async () => {
			const binh = await makeUser("binh");
			const group = await createConversation(mai.id, { participantIds: [linh.id, binh.id] });
			await restrictUser(mai.id, linh.id);

			await sendMessage(linh.id, group.id, { content: "hello group" });

			const conversations = (await listConversationsForUser(mai.id)).items;
			const found = conversations.find((candidate) => candidate.id === group.id);
			expect(found?.unreadCount).toBe(1);
		});

		it("does not affect the restricted person's own badge", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
			// linh restricts mai — a one-directional row that changes what *linh*
			// sees. It says nothing about what mai sees of linh.
			await restrictUser(linh.id, mai.id);

			await sendMessage(linh.id, conversation.id, { content: "hello" });

			const conversations = (await listConversationsForUser(mai.id)).items;
			const found = conversations.find((candidate) => candidate.id === conversation.id);
			expect(found?.unreadCount).toBe(1);
		});
	});

	describe("read receipts", () => {
		it("hides the restrictor's read receipt from the restricted peer, but still clears their own badge", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
			const message = await sendMessage(linh.id, conversation.id, { content: "hi" });
			await restrictUser(mai.id, linh.id);

			await expect(
				markConversationRead(mai.id, conversation.id, { messageId: message.id }),
			).resolves.toMatchObject({ lastReadMessageId: message.id });
			const marker = await prisma.conversationParticipant.findUniqueOrThrow({
				where: { conversationId_userId: { conversationId: conversation.id, userId: mai.id } },
				select: { lastReadMessageId: true, lastSharedReadMessageId: true },
			});
			expect(marker).toEqual({ lastReadMessageId: message.id, lastSharedReadMessageId: null });
		});

		it("leaves the restricted person's own receipts to the restrictor untouched", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
			const message = await sendMessage(mai.id, conversation.id, { content: "hi" });
			await restrictUser(mai.id, linh.id);

			await markConversationRead(linh.id, conversation.id, { messageId: message.id });

			const marker = await prisma.conversationParticipant.findUniqueOrThrow({
				where: { conversationId_userId: { conversationId: conversation.id, userId: linh.id } },
				select: { lastSharedReadMessageId: true },
			});
			expect(marker.lastSharedReadMessageId).toBe(message.id);
		});
	});

	describe("presence room filtering", () => {
		it("excludes a direct room where the caller has restricted the other participant", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
			await restrictUser(mai.id, linh.id);

			await expect(excludeRestrictedDirectRoomIds(mai.id, [conversation.id])).resolves.toEqual([]);
			// Unaffected from the other side — the restrictor's own presence is
			// still visible to them.
			await expect(excludeRestrictedDirectRoomIds(linh.id, [conversation.id])).resolves.toEqual([
				conversation.id,
			]);
		});

		it("leaves an unrestricted room in the list", async () => {
			const conversation = await createConversation(mai.id, { participantIds: [linh.id] });

			await expect(excludeRestrictedDirectRoomIds(mai.id, [conversation.id])).resolves.toEqual([conversation.id]);
		});

		it("finds who among a candidate list has restricted the caller", async () => {
			const binh = await makeUser("binh");
			await restrictUser(linh.id, mai.id);

			await expect(listRestrictorsAmong(mai.id, [linh.id, binh.id])).resolves.toEqual(new Set([linh.id]));
		});
	});
});
