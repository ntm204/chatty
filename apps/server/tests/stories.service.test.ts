import { rm, utimes } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { sweepOrphanedAttachments } from "../src/lib/orphaned-uploads.js";
import { prisma } from "../src/lib/prisma.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import { listMessages } from "../src/modules/messages/messages.service.js";
import {
	createStory,
	deleteStory,
	expireStories,
	getStoryAudienceSettings,
	getStoryFeed,
	getStoryMediaFile,
	listStoryViewers,
	replyToStory,
	setCloseFriends,
	setStoryAudience,
	setStoryHiddenFrom,
	viewStory,
} from "../src/modules/stories/stories.service.js";
import { createStorySchema } from "../src/modules/stories/stories.schema.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

afterAll(async () => {
	await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
});

async function makeUser(name: string): Promise<string> {
	const user = await prisma.user.create({
		data: { email: `${name}@chatty.test`, handle: `${name}_test`, displayName: name, passwordHash: "x" },
		select: { id: true },
	});

	return user.id;
}

/** Minh and An share a chat; Binh shares one with Minh only; Chi shares nothing with anyone. */
async function people() {
	const [minh, an, binh, chi] = await Promise.all(["minh", "an", "binh", "chi"].map(makeUser));
	await createConversation(minh!, { participantIds: [an!] });
	await createConversation(minh!, { participantIds: [binh!] });

	return { minh: minh!, an: an!, binh: binh!, chi: chi! };
}

function image(): Promise<Buffer> {
	return sharp({ create: { width: 40, height: 60, channels: 3, background: { r: 20, g: 120, b: 200 } } })
		.png()
		.toBuffer();
}

const text = (words: string) => ({
	text: words,
	background: "iris" as const,
	audience: "contacts" as const,
	durationHours: 24 as const,
});

function storyNudges() {
	return fakeIO.emits.filter((emit) => emit.event === "story:changed");
}

describe("posting a story", () => {
	it("needs words and a colour for text, or a photo — and lasts 24 hours", async () => {
		const { minh } = await people();
		await expect(createStory(minh, { audience: "contacts", durationHours: 24 })).rejects.toBeInstanceOf(
			ValidationError,
		);
		await expect(createStory(minh, { text: "hi", audience: "contacts", durationHours: 24 })).rejects.toThrow(
			"A text story needs a background colour",
		);

		const story = await createStory(minh, text("Morning!"));
		expect(story).toMatchObject({ kind: "text", text: "Morning!", background: "iris", audience: "contacts" });
		expect(story.viewCount).toBe(0);
		const lifetime = Date.parse(story.expiresAt) - Date.parse(story.createdAt);
		expect(Math.abs(lifetime - 86_400_000)).toBeLessThan(5_000);

		const photo = await createStory(
			minh,
			{ text: "the view", audience: "contacts", durationHours: 24 },
			{ kind: "photo", buffer: await image() },
		);
		expect(photo.kind).toBe("photo");
		expect(photo.media).toMatchObject({ width: 40, height: 60 });
		expect(photo.media?.url).toContain("/stories/media/");
	});

	it("nudges exactly the people who can see it, never the rest", async () => {
		const { minh, an, binh, chi } = await people();
		await setCloseFriends(minh, [an]);
		fakeIO.emits.length = 0;

		await createStory(minh, { ...text("friends only"), audience: "close_friends" });
		const rooms = storyNudges().flatMap((emit) => emit.room as unknown as string[]);
		expect(rooms).toEqual(expect.arrayContaining([`user:${minh}`, `user:${an}`]));
		expect(rooms).not.toContain(`user:${binh}`);
		expect(rooms).not.toContain(`user:${chi}`);
	});
});

describe("the stories row", () => {
	it("shows people you chat with — not strangers, and never across a block, restriction or hide", async () => {
		const { minh, an, binh, chi } = await people();
		await createStory(minh, text("hello"));

		expect((await getStoryFeed(an)).authors.map((group) => group.author.id)).toEqual([minh]);
		expect((await getStoryFeed(binh)).authors).toHaveLength(1);
		expect((await getStoryFeed(chi)).authors).toHaveLength(0);
		expect((await getStoryFeed(minh)).mine).toHaveLength(1);

		await prisma.userBlock.create({ data: { blockerId: an, blockedId: minh } });
		expect((await getStoryFeed(an)).authors).toHaveLength(0);
		await prisma.userRestriction.create({ data: { restrictorId: minh, restrictedId: binh } });
		expect((await getStoryFeed(binh)).authors).toHaveLength(0);
	});

	it("keeps close-friends stories and hidden lists to their owner's choice", async () => {
		const { minh, an, binh } = await people();
		await setCloseFriends(minh, [an]);
		await createStory(minh, { ...text("inner circle"), audience: "close_friends" });

		expect((await getStoryFeed(an)).authors).toHaveLength(1);
		expect((await getStoryFeed(binh)).authors).toHaveLength(0);

		await setStoryHiddenFrom(minh, [an]);
		expect((await getStoryFeed(an)).authors).toHaveLength(0);
	});

	it("puts people with something unseen first, and marks what you have seen", async () => {
		const { minh, an, binh } = await people();
		await createConversation(an, { participantIds: [binh] });
		const fromAn = await createStory(an, text("from An"));
		await createStory(binh, text("from Binh"));
		await viewStory(minh, fromAn.id);

		const feed = await getStoryFeed(minh);
		expect(feed.authors.map((group) => [group.author.id, group.hasUnseen])).toEqual([
			[binh, true],
			[an, false],
		]);
		expect(feed.authors[1]?.stories[0]?.isViewed).toBe(true);
	});

	it("drops an expired story at its instant, before the sweep, and the sweep removes it and its photo", async () => {
		const { minh, an } = await people();
		const photo = await createStory(
			minh,
			{ audience: "contacts", durationHours: 24 },
			{ kind: "photo", buffer: await image() },
		);
		const mediaId = new URL(photo.media!.url).pathname.split("/").at(-1)!;
		await prisma.story.update({ where: { id: photo.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

		expect((await getStoryFeed(an)).authors).toHaveLength(0);
		expect((await getStoryFeed(minh)).mine).toHaveLength(0);
		expect(await findAttachmentPath(mediaId)).not.toBeNull();

		expect(await expireStories()).toBe(1);
		expect(await prisma.story.count()).toBe(0);
		expect(await findAttachmentPath(mediaId)).toBeNull();
	});
});

describe("views", () => {
	it("are recorded once, listed only when shared, and the list follows the author's own receipts", async () => {
		const { minh, an, binh } = await people();
		const story = await createStory(minh, text("who sees this?"));
		await prisma.user.update({ where: { id: binh }, data: { readReceiptsEnabled: false } });

		await viewStory(an, story.id);
		await viewStory(an, story.id);
		await viewStory(binh, story.id);
		await viewStory(minh, story.id);

		expect(await prisma.storyView.count({ where: { storyId: story.id } })).toBe(2);
		expect((await listStoryViewers(minh, story.id)).map((viewer) => viewer.user.id)).toEqual([an]);
		expect((await getStoryFeed(minh)).mine[0]?.viewCount).toBe(1);

		await prisma.user.update({ where: { id: minh }, data: { readReceiptsEnabled: false } });
		await expect(listStoryViewers(minh, story.id)).rejects.toBeInstanceOf(ForbiddenError);
		await expect(listStoryViewers(an, story.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("cannot be recorded on a story you may not see", async () => {
		const { minh, chi } = await people();
		const story = await createStory(minh, text("not for strangers"));
		await expect(viewStory(chi, story.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("replies", () => {
	it("land in the direct chat with the author, quoting the story until it expires", async () => {
		const { minh, an } = await people();
		const story = await createStory(minh, text("ask me anything"));

		const reply = await replyToStory(an, story.id, "what's new?");
		expect(reply.content).toBe("what's new?");
		expect(reply.storyReply).toMatchObject({ storyId: story.id, isExpired: false, text: "ask me anything" });

		await prisma.story.update({ where: { id: story.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
		await expireStories();
		const [reloaded] = await listMessages(minh, reply.conversationId, { limit: 1 });
		expect(reloaded?.storyReply).toEqual({
			storyId: null,
			isExpired: true,
			thumbUrl: null,
			text: "",
			background: null,
		});
	});

	it("start a direct chat when none exists, and refuse across a block", async () => {
		const { minh, an, binh } = await people();
		const group = await createConversation(an, { participantIds: [binh, minh], name: "Trio" });
		expect(group.isGroup).toBe(true);
		const story = await createStory(binh, text("from the group"));
		const anBinhDirect = await prisma.conversation.count({
			where: {
				isGroup: false,
				AND: [{ participants: { some: { userId: an } } }, { participants: { some: { userId: binh } } }],
			},
		});
		expect(anBinhDirect).toBe(0);

		const reply = await replyToStory(an, story.id, "saw it");
		const conversation = await prisma.conversation.findUniqueOrThrow({
			where: { id: reply.conversationId },
			select: { isGroup: true },
		});
		expect(conversation.isGroup).toBe(false);

		await prisma.userBlock.create({ data: { blockerId: binh, blockedId: an } });
		await expect(replyToStory(an, story.id, "again")).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("audience", () => {
	it("can change while live, nudging both the old and the new audience", async () => {
		const { minh, an, binh } = await people();
		await setCloseFriends(minh, [an]);
		const story = await createStory(minh, text("re-targeted"));
		fakeIO.emits.length = 0;

		const updated = await setStoryAudience(minh, story.id, { audience: "close_friends" });
		expect(updated.audience).toBe("close_friends");
		expect((await getStoryFeed(binh)).authors).toHaveLength(0);
		const rooms = storyNudges().flatMap((emit) => emit.room as unknown as string[]);
		expect(rooms).toEqual(expect.arrayContaining([`user:${an}`, `user:${binh}`]));
	});

	it("lists only people you chat with, and refuses anyone else or yourself", async () => {
		const { minh, an, binh, chi } = await people();
		const settings = await setCloseFriends(minh, [an, binh]);
		expect(settings.closeFriendIds.sort()).toEqual([an, binh].sort());
		expect(settings.contacts.map((contact) => contact.id).sort()).toEqual([an, binh].sort());

		await expect(setCloseFriends(minh, [chi])).rejects.toBeInstanceOf(ValidationError);
		await expect(setStoryHiddenFrom(minh, [minh])).rejects.toBeInstanceOf(ValidationError);
		expect((await getStoryAudienceSettings(minh)).hiddenIds).toEqual([]);
	});
});

describe("deleting and serving photos", () => {
	it("serves a live photo only with its token, and stops the moment it is deleted", async () => {
		const { minh, an } = await people();
		const story = await createStory(
			minh,
			{ audience: "contacts", durationHours: 24 },
			{ kind: "photo", buffer: await image() },
		);
		const url = new URL(story.media!.url);
		const mediaId = url.pathname.split("/").at(-1)!;
		const token = url.searchParams.get("token")!;

		expect((await getStoryMediaFile(mediaId, token)).filePath).toContain(mediaId);
		await expect(getStoryMediaFile(mediaId, "forged")).rejects.toBeInstanceOf(NotFoundError);

		await expect(deleteStory(an, story.id)).rejects.toBeInstanceOf(NotFoundError);
		await deleteStory(minh, story.id);
		await expect(getStoryMediaFile(mediaId, token)).rejects.toBeInstanceOf(NotFoundError);
		expect(await findAttachmentPath(mediaId)).toBeNull();
	});

	it("is never mistaken for an orphan by the upload sweep", async () => {
		const { minh } = await people();
		const story = await createStory(
			minh,
			{ audience: "contacts", durationHours: 24 },
			{ kind: "photo", buffer: await image() },
		);
		const mediaId = new URL(story.media!.url).pathname.split("/").at(-1)!;
		const filePath = (await findAttachmentPath(mediaId))!;
		const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
		await utimes(filePath, twoHoursAgo, twoHoursAgo);

		await sweepOrphanedAttachments();
		expect(await findAttachmentPath(mediaId)).not.toBeNull();
	});
});

describe("video stories and lifetimes", () => {
	/** A real 20-second 1080×1920 phone-shaped clip with sound, made by the same ffmpeg the server uses. */
	async function phoneClip(): Promise<Buffer> {
		const { spawnSync } = await import("node:child_process");
		const { createRequire } = await import("node:module");
		const { mkdtemp, readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const { tmpdir } = await import("node:os");
		const ffmpeg = createRequire(import.meta.url)("ffmpeg-static") as string;
		const directory = await mkdtemp(join(tmpdir(), "story-clip-"));
		const output = join(directory, "clip.mp4");
		const result = spawnSync(ffmpeg, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=1080x1920:rate=30",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440",
			"-t",
			"20",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			output,
		]);
		if (result.status !== 0) throw new Error(result.stderr.toString());
		const clip = await readFile(output);
		await rm(directory, { recursive: true, force: true });

		return clip;
	}

	it("re-encodes a phone clip to a 720p, 15-second MP4 with a poster, and serves each part", async () => {
		const { minh } = await people();
		const clip = await phoneClip();
		const story = await createStory(
			minh,
			{ text: "the waves", audience: "contacts", durationHours: 24 },
			{ kind: "video", buffer: clip },
		);

		expect(story.kind).toBe("video");
		expect(story.media).toMatchObject({ width: 720, height: 1280 });
		expect(story.media?.durationMs).toBeGreaterThan(14_000);
		expect(story.media?.durationMs).toBeLessThanOrEqual(15_000);
		expect(story.media?.posterUrl).toContain("size=poster");

		const url = new URL(story.media!.url);
		const mediaId = url.pathname.split("/").at(-1)!;
		const token = url.searchParams.get("token")!;
		expect(await getStoryMediaFile(mediaId, token)).toMatchObject({ contentType: "video/mp4" });
		expect(await getStoryMediaFile(mediaId, token, "poster")).toMatchObject({ contentType: "image/webp" });
		expect(await getStoryMediaFile(mediaId, token, "thumb")).toMatchObject({ contentType: "image/webp" });

		// The storage measurement ADR 0025 asks for, recorded on the row.
		const row = await prisma.story.findUniqueOrThrow({ where: { id: story.id }, select: { mediaByteSize: true } });
		expect(row.mediaByteSize).toBeGreaterThan(0);
		expect(row.mediaByteSize!).toBeLessThan(clip.byteLength);
		console.info(`story video: ${clip.byteLength} B in → ${row.mediaByteSize} B stored`);

		await deleteStory(minh, story.id);
		expect(await findAttachmentPath(mediaId, "FILE")).toBeNull();
		expect(await findAttachmentPath(mediaId)).toBeNull();
	}, 60_000);

	it("refuses something that is not a video", async () => {
		const { minh } = await people();
		await expect(
			createStory(
				minh,
				{ audience: "contacts", durationHours: 24 },
				{ kind: "video", buffer: Buffer.from("not a video") },
			),
		).rejects.toThrow("That video could not be read");
		expect(await prisma.story.count()).toBe(0);
	});

	it("lasts the chosen 6, 12, 24 or 48 hours, and nothing else", async () => {
		const { minh } = await people();
		for (const hours of [6, 12, 48] as const) {
			const story = await createStory(minh, { ...text(`${hours}h`), durationHours: hours });
			const lifetime = Date.parse(story.expiresAt) - Date.parse(story.createdAt);
			expect(Math.abs(lifetime - hours * 3_600_000)).toBeLessThan(5_000);
		}
		expect(() => createStorySchema.parse({ text: "x", background: "iris", durationHours: 72 })).toThrow();
		expect(createStorySchema.parse({ text: "x", background: "iris", durationHours: "12" }).durationHours).toBe(12);
		await expect(
			prisma.story.create({
				data: {
					authorId: minh,
					kind: "TEXT",
					text: "too long",
					background: "IRIS",
					expiresAt: new Date(Date.now() + 72 * 3_600_000),
				},
			}),
		).rejects.toThrow();
	});
});
