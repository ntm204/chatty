import type { NoteMusicDTO, StoryDTO, StoryMediaDTO } from "@chatty/shared-types";
import type { ConversationTheme, StoryAudience, StoryKind } from "@prisma/client";
import { buildStoryMediaUrls } from "../../lib/story-media.js";
import { themeToWire } from "../../lib/theme-wire.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";

export const storySelect = {
	id: true,
	kind: true,
	text: true,
	background: true,
	mediaId: true,
	mediaWidth: true,
	mediaHeight: true,
	mediaDurationMs: true,
	musicTrackId: true,
	musicTitle: true,
	musicArtist: true,
	musicArtworkUrl: true,
	musicPreviewUrl: true,
	audience: true,
	createdAt: true,
	expiresAt: true,
	author: { select: { ...userSelect, allowMessageForwarding: true } },
} as const;

export interface StoryRow {
	id: string;
	kind: StoryKind;
	text: string;
	background: ConversationTheme | null;
	mediaId: string | null;
	mediaWidth: number | null;
	mediaHeight: number | null;
	mediaDurationMs: number | null;
	musicTrackId: string | null;
	musicTitle: string | null;
	musicArtist: string | null;
	musicArtworkUrl: string | null;
	musicPreviewUrl: string | null;
	audience: StoryAudience;
	createdAt: Date;
	expiresAt: Date;
	author: UserRow & { allowMessageForwarding: boolean };
}

function toStoryMediaDTO(row: StoryRow): StoryMediaDTO {
	const urls = buildStoryMediaUrls(row.mediaId!);
	const isVideo = row.kind === "VIDEO";

	return {
		url: urls.url,
		thumbUrl: urls.thumbUrl,
		posterUrl: isVideo ? urls.posterUrl : null,
		width: row.mediaWidth,
		height: row.mediaHeight,
		durationMs: isVideo ? row.mediaDurationMs : null,
	};
}

function toNoteMusicDTO(row: StoryRow): NoteMusicDTO | null {
	if (!row.musicTrackId || !row.musicTitle || !row.musicArtist || !row.musicArtworkUrl || !row.musicPreviewUrl) {
		return null;
	}

	return {
		trackId: row.musicTrackId,
		title: row.musicTitle,
		artist: row.musicArtist,
		artworkUrl: row.musicArtworkUrl,
		previewUrl: row.musicPreviewUrl,
	};
}

const AUDIENCE_TO_WIRE: Record<StoryAudience, StoryDTO["audience"] & string> = {
	CONTACTS: "contacts",
	CLOSE_FRIENDS: "close_friends",
	FRIENDS: "friends",
	FOLLOWERS: "followers",
};

interface StoryViewerContext {
	viewerId: string;
	isViewed: boolean;
	/** Shared views, counted only for the author's own stories. */
	viewCount?: number;
	isLiked?: boolean;
	/** Likes, counted only for the author's own notes. */
	likeCount?: number;
}

/**
 * A story as `viewerId` sees it. The audience and the view count describe who
 * the author chose and who looked — facts for the author alone, so they ride
 * only on the author's own copy.
 */
export function toStoryDTO(
	row: StoryRow,
	{ viewerId, isViewed, viewCount, isLiked = false, likeCount }: StoryViewerContext,
): StoryDTO {
	const isMine = row.author.id === viewerId;

	return {
		id: row.id,
		author: toUserDTO(row.author, true),
		kind: row.kind === "PHOTO" ? "photo" : row.kind === "VIDEO" ? "video" : "text",
		text: row.text,
		background: row.background ? themeToWire(row.background) : null,
		media: row.mediaId ? toStoryMediaDTO(row) : null,
		music: toNoteMusicDTO(row),
		createdAt: row.createdAt.toISOString(),
		expiresAt: row.expiresAt.toISOString(),
		isViewed: isMine || isViewed,
		isSaveAllowed: isMine || row.author.allowMessageForwarding,
		isLiked: !isMine && isLiked,
		...(isMine && {
			audience: AUDIENCE_TO_WIRE[row.audience],
			viewCount: viewCount ?? 0,
			likeCount: likeCount ?? 0,
		}),
	};
}
