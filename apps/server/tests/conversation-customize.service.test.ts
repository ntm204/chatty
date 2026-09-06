import { rm } from "node:fs/promises";
import sharp from "sharp";
import { beforeEach, describe, expect, it, afterAll } from "vitest";
import { ForbiddenError, NotFoundError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import {
	createConversation,
	getConversationAvatarFilePath,
	listConversationsForUser,
	removeConversationPhoto,
	setConversationNickname,
	setConversationPhoto,
	setConversationQuickReaction,
	setConversationTheme,
} from "../src/modules/conversations/conversations.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

/** Matches UPLOAD_DIR in vitest.config.ts — the whole tree is removed at the end. */
const UPLOAD_DIR = ".data/test-uploads";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

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

	return createConversation(creatorId, { participantIds, name: "Customize" });
}

async function conversationFor(userId: string, conversationId: string) {
	const conversation = (await listConversationsForUser(userId)).items.find((item) => item.id === conversationId);
	if (!conversation) throw new Error("conversation missing from fixture");

	return conversation;
}

/** A real, decodable image — the service re-encodes, so a fake buffer would not survive. */
function makeImage(): Promise<Buffer> {
	return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 90, b: 160 } } })
		.png()
		.toBuffer();
}

describe("conversation theme", () => {
	it("lets any participant set it, in a direct conversation or a group, idempotently", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		const updated = await setConversationTheme(anId, direct.id, { theme: "azure" });
		expect(updated.themeColor).toBe("azure");

		fakeIO.emits.length = 0;
		await setConversationTheme(anId, direct.id, { theme: "azure" });
		expect(fakeIO.emits).toHaveLength(0);

		expect((await conversationFor(minhId, direct.id)).themeColor).toBe("azure");
	});

	it("clears back to the default with null", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });
		await setConversationTheme(minhId, direct.id, { theme: "moss" });

		const updated = await setConversationTheme(anId, direct.id, { theme: null });

		expect(updated.themeColor).toBeNull();
	});

	it("refuses someone who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(setConversationTheme(outsiderId, direct.id, { theme: "azure" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});

describe("conversation quick reaction", () => {
	it("lets any participant override the shared default reaction", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		const updated = await setConversationQuickReaction(binhId, group.id, { emoji: "😂" });

		expect(updated.quickReactionEmoji).toBe("😂");
		expect((await conversationFor(minhId, group.id)).quickReactionEmoji).toBe("😂");
	});

	it("is idempotent — no broadcast for the same value twice", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });
		await setConversationQuickReaction(minhId, direct.id, { emoji: "👍" });

		fakeIO.emits.length = 0;
		await setConversationQuickReaction(anId, direct.id, { emoji: "👍" });

		expect(fakeIO.emits).toHaveLength(0);
	});
});

describe("conversation nickname — shared, per-member (ADR 0022)", () => {
	it("is visible to every participant, not just whoever set it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await setConversationNickname(anId, group.id, binhId, { nickname: "Bee" });

		const seenByMinh = await conversationFor(minhId, group.id);
		const binhRow = seenByMinh.participants.find((participant) => participant.id === binhId);
		expect(binhRow?.nickname).toBe("Bee");
		// Broadcast to the whole room, unlike the old self-only event.
		expect(fakeIO.emits.some((emit) => emit.event === "conversation:updated")).toBe(true);
	});

	it("lets anyone set their own nickname too", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await setConversationNickname(anId, group.id, anId, { nickname: "Ant" });

		expect((await conversationFor(minhId, group.id)).participants.find((p) => p.id === anId)?.nickname).toBe("Ant");
	});

	it("refuses a target who is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(
			setConversationNickname(minhId, direct.id, outsiderId, { nickname: "Ghost" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("writes a system line and clears with null", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });
		await setConversationNickname(minhId, direct.id, anId, { nickname: "Ant" });

		await setConversationNickname(minhId, direct.id, anId, { nickname: null });

		const messages = await prisma.message.findMany({
			where: { conversationId: direct.id, kind: "SYSTEM" },
			orderBy: { createdAt: "asc" },
			select: { content: true },
		});
		expect(messages.map((message) => message.content)).toEqual([
			`minh set an's nickname to "Ant"`,
			"minh removed an's nickname",
		]);
	});
});

describe("conversation photo — group-only, admin-gated", () => {
	it("lets an admin set and remove it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		const withPhoto = await setConversationPhoto(minhId, group.id, await makeImage());
		expect(withPhoto.avatarUrl).toMatch(new RegExp(`/conversations/${group.id}/avatar\\?v=`));
		await expect(getConversationAvatarFilePath(group.id)).resolves.toEqual(expect.any(String));

		const cleared = await removeConversationPhoto(minhId, group.id);
		expect(cleared.avatarUrl).toBeNull();
		await expect(getConversationAvatarFilePath(group.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("refuses an ordinary member", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const group = await createGroup(minhId, [anId, binhId]);

		await expect(setConversationPhoto(anId, group.id, await makeImage())).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("refuses a direct conversation — there is no group identity to give a photo", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const direct = await createConversation(minhId, { participantIds: [anId] });

		await expect(setConversationPhoto(minhId, direct.id, await makeImage())).rejects.toThrow(
			/only available in a group conversation/,
		);
	});
});
