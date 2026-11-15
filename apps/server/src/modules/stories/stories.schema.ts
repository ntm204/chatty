import { STORY_DURATION_HOURS, STORY_TEXT_MAX_LENGTH, type StoryDurationHours } from "@chatty/shared-types";
import { z } from "zod";

const THEMES = ["azure", "amber", "moss", "plum", "clay", "teal", "iris", "fern"] as const;
const AUDIENCES = ["contacts", "close_friends"] as const;

/**
 * The fields of `POST /stories`. The photo arrives as `req.file`, so whether a
 * text story has its words — and a photo story its photo — is decided in the
 * controller, the one place that sees both.
 */
export const createStorySchema = z.object({
	text: z.string().max(STORY_TEXT_MAX_LENGTH).optional(),
	background: z.enum(THEMES).optional(),
	audience: z.enum(AUDIENCES).default("contacts"),
	// Multipart sends numbers as strings; one of the offered lifetimes or nothing (24h).
	durationHours: z.coerce
		.number()
		.refine((hours): hours is StoryDurationHours => (STORY_DURATION_HOURS as readonly number[]).includes(hours), {
			message: "Choose one of the offered lifetimes",
		})
		.default(24),
});
export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const setStoryAudienceSchema = z.object({ audience: z.enum(AUDIENCES) });
export type SetStoryAudienceInput = z.infer<typeof setStoryAudienceSchema>;

export const setStoryPeopleSchema = z.object({ userIds: z.array(z.string().min(1).max(64)).max(1000) });
export type SetStoryPeopleInput = z.infer<typeof setStoryPeopleSchema>;

export const replyToStorySchema = z.object({ content: z.string().trim().min(1).max(4000) });
export type ReplyToStoryInput = z.infer<typeof replyToStorySchema>;

export const storyMediaQuerySchema = z.object({
	token: z.string().min(1),
	size: z.enum(["thumb", "poster"]).optional(),
});
