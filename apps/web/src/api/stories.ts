/**
 * 24-hour stories: the row, posting, views, viewers, audience and replies.
 * Composed into the public `api` object in ./client.ts. See ADR 0025.
 */
import type {
	MessageDTO,
	ReplyToStoryRequest,
	SetStoryAudienceRequest,
	SetStoryPeopleRequest,
	StoryAudience,
	StoryDurationHours,
	StoryAudienceSettingsDTO,
	StoryDTO,
	StoryFeedDTO,
	StoryViewerDTO,
	ConversationTheme,
} from "@chatty/shared-types";
import { request, get, post, STORY_PHOTO_FIELD, STORY_VIDEO_FIELD } from "./core";

export const storiesApi = {
	getStoryFeed(): Promise<StoryFeedDTO> {
		return get<StoryFeedDTO>("/stories");
	},

	/**
	 * A photo or video story, multipart. A photo is already reduced by the
	 * browser; a video goes as recorded and the server re-encodes it to 720p.
	 */
	createMediaStory(
		kind: "photo" | "video",
		file: File,
		caption: string,
		audience: StoryAudience,
		durationHours: StoryDurationHours,
	): Promise<StoryDTO> {
		const body = new FormData();
		body.append(kind === "video" ? STORY_VIDEO_FIELD : STORY_PHOTO_FIELD, file);
		if (caption) body.append("text", caption);
		body.append("audience", audience);
		body.append("durationHours", String(durationHours));

		return request<StoryDTO>("/stories", { method: "POST", body });
	},

	createTextStory(
		text: string,
		background: ConversationTheme,
		audience: StoryAudience,
		durationHours: StoryDurationHours,
	): Promise<StoryDTO> {
		return post<StoryDTO>("/stories", { text, background, audience, durationHours });
	},

	deleteStory(storyId: string): Promise<void> {
		return request<void>(`/stories/${storyId}`, { method: "DELETE" });
	},

	setStoryAudience(storyId: string, audience: StoryAudience): Promise<StoryDTO> {
		const body: SetStoryAudienceRequest = { audience };

		return request<StoryDTO>(`/stories/${storyId}/audience`, { method: "PUT", body: JSON.stringify(body) });
	},

	viewStory(storyId: string): Promise<void> {
		return post<void>(`/stories/${storyId}/view`, {});
	},

	listStoryViewers(storyId: string): Promise<StoryViewerDTO[]> {
		return get<StoryViewerDTO[]>(`/stories/${storyId}/viewers`);
	},

	replyToStory(storyId: string, content: string): Promise<MessageDTO> {
		const body: ReplyToStoryRequest = { content };

		return post<MessageDTO>(`/stories/${storyId}/reply`, body);
	},

	getStoryAudienceSettings(): Promise<StoryAudienceSettingsDTO> {
		return get<StoryAudienceSettingsDTO>("/stories/audience");
	},

	setCloseFriends(userIds: string[]): Promise<StoryAudienceSettingsDTO> {
		const body: SetStoryPeopleRequest = { userIds };

		return request<StoryAudienceSettingsDTO>("/stories/audience/close-friends", {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	setStoryHiddenFrom(userIds: string[]): Promise<StoryAudienceSettingsDTO> {
		const body: SetStoryPeopleRequest = { userIds };

		return request<StoryAudienceSettingsDTO>("/stories/audience/hidden", {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},
};
