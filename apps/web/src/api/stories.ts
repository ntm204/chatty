/**
 * Notes (stories on the wire): the row, posting, likes, views, audience and replies.
 * Composed into the public `api` object in ./client.ts. See ADR 0025.
 */
import type {
	MessageDTO,
	ReplyToStoryRequest,
	SetStoryAudienceRequest,
	SetStoryPeopleRequest,
	StoryAudience,
	StoryAudienceSettingsDTO,
	StoryDTO,
	StoryFeedDTO,
	StoryLikeDTO,
	StoryViewerDTO,
	NoteMusicSearchDTO,
} from "@chatty/shared-types";
import { request, get, post } from "./core";

export const storiesApi = {
	getStoryFeed(): Promise<StoryFeedDTO> {
		return get<StoryFeedDTO>("/stories");
	},

	/** A note: words, a song from `searchNoteMusic`, or both. The server looks the song up by id. */
	createNote(text: string, musicTrackId: string | null, audience: StoryAudience): Promise<StoryDTO> {
		// No lifetime is sent: a note lasts the server's default 24 hours, as on Messenger.
		return post<StoryDTO>("/stories", { text, audience, ...(musicTrackId && { musicTrackId }) });
	},

	likeStory(storyId: string): Promise<void> {
		return request<void>(`/stories/${storyId}/like`, { method: "PUT" });
	},

	unlikeStory(storyId: string): Promise<void> {
		return request<void>(`/stories/${storyId}/like`, { method: "DELETE" });
	},

	listStoryLikes(storyId: string): Promise<StoryLikeDTO[]> {
		return get<StoryLikeDTO[]>(`/stories/${storyId}/likes`);
	},

	/** Songs for a note: matches for `query`, or what is popular in Vietnam when it is empty. */
	searchNoteMusic(query: string, signal?: AbortSignal): Promise<NoteMusicSearchDTO> {
		return request<NoteMusicSearchDTO>(`/stories/music?q=${encodeURIComponent(query)}`, signal ? { signal } : {});
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
