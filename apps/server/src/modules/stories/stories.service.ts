/**
 * 24-hour stories: posting, the stories row, views, audience and replies.
 * See ADR 0025.
 */
import { randomUUID } from "node:crypto";
import {
	type MessageDTO,
	type StoryAudienceSettingsDTO,
	type StoryAuthorDTO,
	type StoryDTO,
	type StoryFeedDTO,
	type StoryViewerDTO,
} from "@chatty/shared-types";
import type { Prisma, StoryAudience } from "@prisma/client";
import { deleteAttachment, findAttachmentPath, saveAttachment } from "../../lib/attachment-storage.js";
import { isValidAttachmentToken } from "../../lib/attachment-token.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { themeFromWire } from "../../lib/theme-wire.js";
import { saveStoryVideo } from "../../lib/video-storage.js";
import { createConversation, listContactIds } from "../conversations/conversations.service.js";
import { sendMessage } from "../messages/messages.service.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import { storySelect, toStoryDTO } from "./stories.mapper.js";
import type { CreateStoryInput, SetStoryAudienceInput } from "./stories.schema.js";

/** How often the story sweep runs. Every read path already hides an expired story; this removes its file. */
export const STORY_EXPIRY_SWEEP_MS = 30_000;

const AUDIENCE_TO_DB: Record<CreateStoryInput["audience"], StoryAudience> = {
	contacts: "CONTACTS",
	close_friends: "CLOSE_FRIENDS",
};

/**
 * The stories `viewerId` may see, as one filter: everyone they share a
 * conversation with, minus anyone on either side of a block, anyone who has
 * restricted or hidden their stories from the viewer, and close-friends stories
 * the viewer is not a close friend for. Expired stories are never returned,
 * whether or not the sweep has removed them yet.
 */
async function viewableStoryWhere(viewerId: string, now = new Date()): Promise<Prisma.StoryWhereInput> {
	const contactIds = (await listContactIds(viewerId)).filter((id) => id !== viewerId);

	return {
		authorId: { in: contactIds },
		expiresAt: { gt: now },
		author: {
			blocksMade: { none: { blockedId: viewerId } },
			blocksReceived: { none: { blockerId: viewerId } },
			restrictionsMade: { none: { restrictedId: viewerId } },
			storyHiddenFrom: { none: { hiddenUserId: viewerId } },
		},
		OR: [{ audience: "CONTACTS" }, { author: { closeFriends: { some: { friendId: viewerId } } } }],
	};
}

/**
 * Everyone a story with this audience would reach, the author included — the
 * set the realtime nudge goes to. Computed with the same rules as the row, so
 * nobody outside the audience learns that a story they cannot see exists.
 */
async function listAudienceIds(authorId: string, audience: StoryAudience): Promise<string[]> {
	const [contactIds, author] = await Promise.all([
		listContactIds(authorId),
		prisma.user.findUniqueOrThrow({
			where: { id: authorId },
			select: {
				blocksMade: { select: { blockedId: true } },
				blocksReceived: { select: { blockerId: true } },
				restrictionsMade: { select: { restrictedId: true } },
				storyHiddenFrom: { select: { hiddenUserId: true } },
				closeFriends: { select: { friendId: true } },
			},
		}),
	]);
	const excluded = new Set([
		...author.blocksMade.map((row) => row.blockedId),
		...author.blocksReceived.map((row) => row.blockerId),
		...author.restrictionsMade.map((row) => row.restrictedId),
		...author.storyHiddenFrom.map((row) => row.hiddenUserId),
	]);
	const closeFriends = new Set(author.closeFriends.map((row) => row.friendId));

	return contactIds.filter(
		(id) => id === authorId || (!excluded.has(id) && (audience === "CONTACTS" || closeFriends.has(id))),
	);
}

/** Tells these people to refetch their stories row. Best effort: the row is the truth on the next fetch. */
function nudge(authorId: string, userIds: Iterable<string>): void {
	const rooms = [...new Set(userIds)].map(userRoom);
	if (rooms.length > 0) getOptionalIO()?.to(rooms).emit("story:changed", { authorId });
}

/** Yours first, then everyone else's — people with something unseen first, then whoever posted last. */
export async function getStoryFeed(viewerId: string): Promise<StoryFeedDTO> {
	const now = new Date();
	const [mine, theirs] = await Promise.all([
		prisma.story.findMany({
			where: { authorId: viewerId, expiresAt: { gt: now } },
			orderBy: { createdAt: "asc" },
			select: { ...storySelect, _count: { select: { views: { where: { isShared: true } } } } },
		}),
		prisma.story.findMany({
			where: await viewableStoryWhere(viewerId, now),
			orderBy: { createdAt: "asc" },
			select: { ...storySelect, views: { where: { viewerId }, select: { viewerId: true } } },
		}),
	]);

	const byAuthor = new Map<string, StoryAuthorDTO>();
	for (const row of theirs) {
		const story = toStoryDTO(row, { viewerId, isViewed: row.views.length > 0 });
		const group = byAuthor.get(row.author.id);
		if (group) {
			group.stories.push(story);
			group.hasUnseen ||= !story.isViewed;
		} else {
			byAuthor.set(row.author.id, { author: story.author, stories: [story], hasUnseen: !story.isViewed });
		}
	}
	const latest = (group: StoryAuthorDTO) => group.stories.at(-1)?.createdAt ?? "";

	return {
		mine: mine.map((row) => toStoryDTO(row, { viewerId, isViewed: true, viewCount: row._count.views })),
		authors: [...byAuthor.values()].sort(
			(left, right) =>
				Number(right.hasUnseen) - Number(left.hasUnseen) || latest(right).localeCompare(latest(left)),
		),
	};
}

/** The photo or video a story carries, as it arrived. */
export interface StoryMediaUpload {
	kind: "photo" | "video";
	buffer: Buffer;
}

/**
 * Posts a story for the chosen lifetime. Media is re-encoded before the row
 * exists — a photo through the attachment pipeline, a video to 720p H.264 with
 * a poster frame — the same order the send path uses, so a failed write leaves
 * files the orphan sweep reclaims rather than a story pointing at nothing.
 */
export async function createStory(
	authorId: string,
	input: CreateStoryInput,
	media?: StoryMediaUpload,
): Promise<StoryDTO> {
	const text = input.text?.trim() ?? "";
	if (!media && !text) throw new ValidationError("A story needs a photo, a video or some text");
	if (!media && !input.background) throw new ValidationError("A text story needs a background colour");

	const mediaId = media ? randomUUID() : null;
	try {
		const stored =
			media && mediaId
				? media.kind === "video"
					? await saveStoryVideo(mediaId, media.buffer)
					: { ...(await saveAttachment(mediaId, media.buffer)), durationMs: null }
				: null;
		const row = await prisma.story.create({
			data: {
				authorId,
				kind: media ? (media.kind === "video" ? "VIDEO" : "PHOTO") : "TEXT",
				text,
				background: !media && input.background ? themeFromWire(input.background) : null,
				...(mediaId && stored
					? {
							mediaId,
							mediaWidth: stored.width,
							mediaHeight: stored.height,
							mediaDurationMs: stored.durationMs,
							mediaByteSize: stored.byteSize,
						}
					: {}),
				audience: AUDIENCE_TO_DB[input.audience],
				expiresAt: new Date(Date.now() + input.durationHours * 3_600_000),
			},
			select: storySelect,
		});
		nudge(authorId, await listAudienceIds(authorId, row.audience));

		return toStoryDTO(row, { viewerId: authorId, isViewed: true, viewCount: 0 });
	} catch (error) {
		if (mediaId) await deleteAttachment(mediaId).catch(() => undefined);
		throw error;
	}
}

async function loadOwnStory(authorId: string, storyId: string) {
	const story = await prisma.story.findFirst({
		where: { id: storyId, authorId, expiresAt: { gt: new Date() } },
		select: { id: true, mediaId: true, audience: true },
	});
	if (!story) throw new NotFoundError("Story not found");

	return story;
}

/** Removes one of your stories now, its photo with it. Nothing is archived. */
export async function deleteStory(authorId: string, storyId: string): Promise<void> {
	const story = await loadOwnStory(authorId, storyId);
	const audienceIds = await listAudienceIds(authorId, story.audience);
	await prisma.story.delete({ where: { id: storyId } });
	if (story.mediaId) await deleteAttachment(story.mediaId).catch(() => undefined);
	nudge(authorId, audienceIds);
}

/** Changes who a live story reaches (Telegram's rule). Both the old and the new audience refetch. */
export async function setStoryAudience(
	authorId: string,
	storyId: string,
	input: SetStoryAudienceInput,
): Promise<StoryDTO> {
	const story = await loadOwnStory(authorId, storyId);
	const audience = AUDIENCE_TO_DB[input.audience];
	const row = await prisma.story.update({
		where: { id: storyId },
		data: { audience },
		select: { ...storySelect, _count: { select: { views: { where: { isShared: true } } } } },
	});
	if (story.audience !== audience) {
		const [before, after] = await Promise.all([
			listAudienceIds(authorId, story.audience),
			listAudienceIds(authorId, audience),
		]);
		nudge(authorId, [...before, ...after]);
	}

	return toStoryDTO(row, { viewerId: authorId, isViewed: true, viewCount: row._count.views });
}

async function loadViewableStory(viewerId: string, storyId: string) {
	const story = await prisma.story.findFirst({
		where: { id: storyId, ...(await viewableStoryWhere(viewerId)) },
		select: { id: true, authorId: true },
	});
	if (!story) throw new NotFoundError("Story not found");

	return story;
}

/**
 * Records that `viewerId` saw a story, once. Whether the author may see that
 * follows the viewer's read receipts — the same symmetric choice as "Seen" in
 * a chat, as WhatsApp does for status. Your own stories record nothing.
 */
export async function viewStory(viewerId: string, storyId: string): Promise<void> {
	const own = await prisma.story.findFirst({ where: { id: storyId, authorId: viewerId }, select: { id: true } });
	if (own) return;
	const story = await loadViewableStory(viewerId, storyId);
	const viewer = await prisma.user.findUniqueOrThrow({
		where: { id: viewerId },
		select: { readReceiptsEnabled: true },
	});
	const existing = await prisma.storyView.findUnique({
		where: { storyId_viewerId: { storyId, viewerId } },
		select: { storyId: true },
	});
	if (existing) return;

	await prisma.storyView.create({ data: { storyId, viewerId, isShared: viewer.readReceiptsEnabled } });
	if (viewer.readReceiptsEnabled) nudge(story.authorId, [story.authorId]);
}

/**
 * Who opened one of your stories. Symmetric with read receipts: with yours off
 * you see no list, the same way you stop seeing "Seen" in chats.
 */
export async function listStoryViewers(authorId: string, storyId: string): Promise<StoryViewerDTO[]> {
	await loadOwnStory(authorId, storyId);
	const author = await prisma.user.findUniqueOrThrow({
		where: { id: authorId },
		select: { readReceiptsEnabled: true },
	});
	if (!author.readReceiptsEnabled) {
		throw new ForbiddenError("Turn on read receipts to see who viewed your story");
	}
	const views = await prisma.storyView.findMany({
		where: { storyId, isShared: true },
		orderBy: { viewedAt: "desc" },
		select: { viewedAt: true, viewer: { select: userSelect } },
	});

	return views.map((view) => ({ user: toUserDTO(view.viewer, true), viewedAt: view.viewedAt.toISOString() }));
}

/**
 * Answers a story in the direct conversation with its author, starting one if
 * needed. A story has no comment section by design: every reply continues a
 * conversation between two people. Blocks are enforced by the conversation and
 * send paths themselves.
 */
export async function replyToStory(viewerId: string, storyId: string, content: string): Promise<MessageDTO> {
	const story = await loadViewableStory(viewerId, storyId);
	const conversation = await createConversation(viewerId, { participantIds: [story.authorId] });

	return sendMessage(viewerId, conversation.id, { content, storyReplyId: story.id });
}

/** The people your stories can reach, and the two private lists drawn from them. */
export async function getStoryAudienceSettings(userId: string): Promise<StoryAudienceSettingsDTO> {
	const contactIds = (await listContactIds(userId)).filter((id) => id !== userId);
	const [contacts, user] = await Promise.all([
		prisma.user.findMany({
			where: { id: { in: contactIds } },
			select: userSelect,
			orderBy: { displayName: "asc" },
		}),
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: {
				closeFriends: { select: { friendId: true } },
				storyHiddenFrom: { select: { hiddenUserId: true } },
			},
		}),
	]);
	const contactSet = new Set(contactIds);

	return {
		contacts: contacts.map((contact) => toUserDTO(contact, true)),
		closeFriendIds: user.closeFriends.map((row) => row.friendId).filter((id) => contactSet.has(id)),
		hiddenIds: user.storyHiddenFrom.map((row) => row.hiddenUserId).filter((id) => contactSet.has(id)),
	};
}

async function assertContacts(userId: string, userIds: string[]): Promise<string[]> {
	const unique = [...new Set(userIds)];
	const contacts = new Set(await listContactIds(userId));
	if (unique.some((id) => id === userId || !contacts.has(id))) {
		throw new ValidationError("You can only choose people you chat with");
	}

	return unique;
}

/**
 * Replaces one of the two private lists. Anyone whose access to a live story
 * changes — added or removed — refetches, so a story appears or disappears now.
 */
async function replacePeopleList(
	userId: string,
	userIds: string[],
	list: "closeFriends" | "hidden",
): Promise<StoryAudienceSettingsDTO> {
	const next = await assertContacts(userId, userIds);
	const previous = await prisma.$transaction(async (transaction) => {
		if (list === "closeFriends") {
			const rows = await transaction.closeFriend.findMany({ where: { userId }, select: { friendId: true } });
			await transaction.closeFriend.deleteMany({ where: { userId, friendId: { notIn: next } } });
			await transaction.closeFriend.createMany({
				data: next.map((friendId) => ({ userId, friendId })),
				skipDuplicates: true,
			});

			return rows.map((row) => row.friendId);
		}
		const rows = await transaction.storyHiddenFrom.findMany({ where: { userId }, select: { hiddenUserId: true } });
		await transaction.storyHiddenFrom.deleteMany({ where: { userId, hiddenUserId: { notIn: next } } });
		await transaction.storyHiddenFrom.createMany({
			data: next.map((hiddenUserId) => ({ userId, hiddenUserId })),
			skipDuplicates: true,
		});

		return rows.map((row) => row.hiddenUserId);
	});

	const before = new Set(previous);
	const changed = [...previous.filter((id) => !next.includes(id)), ...next.filter((id) => !before.has(id))];
	const hasLiveStory = await prisma.story.count({ where: { authorId: userId, expiresAt: { gt: new Date() } } });
	if (hasLiveStory > 0 && changed.length > 0) nudge(userId, changed);

	return getStoryAudienceSettings(userId);
}

export function setCloseFriends(userId: string, userIds: string[]): Promise<StoryAudienceSettingsDTO> {
	return replacePeopleList(userId, userIds, "closeFriends");
}

export function setStoryHiddenFrom(userId: string, userIds: string[]): Promise<StoryAudienceSettingsDTO> {
	return replacePeopleList(userId, userIds, "hidden");
}

/** What `GET /stories/media/:mediaId` sends: a file and the type to label it with. */
export interface StoryMediaFile {
	filePath: string;
	contentType: "image/webp" | "video/mp4";
}

/**
 * The file behind `GET /stories/media/:mediaId`. The token proves the URL was
 * minted for someone allowed to see the story; the live check stops it
 * outliving the story itself. A video's poster and thumbnail are images stored
 * beside it under the same key.
 */
export async function getStoryMediaFile(
	mediaId: string,
	token: string,
	size?: "thumb" | "poster",
): Promise<StoryMediaFile> {
	if (!isValidAttachmentToken(token, mediaId)) throw new NotFoundError("Story not found");
	const story = await prisma.story.findFirst({
		where: { mediaId, expiresAt: { gt: new Date() } },
		select: { kind: true },
	});
	if (!story) throw new NotFoundError("Story not found");
	const isVideoFile = story.kind === "VIDEO" && !size;
	const filePath = isVideoFile
		? await findAttachmentPath(mediaId, "FILE")
		: await findAttachmentPath(mediaId, "IMAGE", size === "thumb");
	if (!filePath) throw new NotFoundError("Story not found");

	return { filePath, contentType: isVideoFile ? "video/mp4" : "image/webp" };
}

/**
 * Deletes every story past its lifetime, photo or video included, and nudges each
 * author's audience. Returns how many went. Exported so tests drive one pass.
 */
export async function expireStories(now = new Date()): Promise<number> {
	let total = 0;
	// Bounded batches, so a backlog after downtime is several short passes.
	for (;;) {
		const erased = await expireStoryBatch(now);
		total += erased;
		if (erased < STORY_EXPIRY_BATCH_SIZE) return total;
	}
}

const STORY_EXPIRY_BATCH_SIZE = 500;

async function expireStoryBatch(now: Date): Promise<number> {
	const expired = await prisma.story.findMany({
		where: { expiresAt: { lte: now } },
		select: { id: true, authorId: true, mediaId: true, audience: true },
		take: STORY_EXPIRY_BATCH_SIZE,
	});
	if (expired.length === 0) return 0;

	await prisma.story.deleteMany({ where: { id: { in: expired.map((story) => story.id) } } });
	for (const story of expired) {
		if (story.mediaId) {
			await deleteAttachment(story.mediaId).catch((error: unknown) => {
				logger.error({ err: error, mediaId: story.mediaId }, "failed to remove an expired story's photo");
			});
		}
	}
	const authors = new Map(expired.map((story) => [story.authorId, story.audience]));
	for (const [authorId, audience] of authors) nudge(authorId, await listAudienceIds(authorId, audience));

	return expired.length;
}

/** Runs `expireStories` on a timer, never overlapping itself. */
export function startStoryExpirySweeper(): NodeJS.Timeout {
	let isRunning = false;
	const timer = setInterval(() => {
		if (isRunning) return;
		isRunning = true;
		expireStories()
			.catch((error: unknown) => logger.error({ err: error }, "story expiry sweep failed"))
			.finally(() => {
				isRunning = false;
			});
	}, STORY_EXPIRY_SWEEP_MS);
	timer.unref();

	return timer;
}
