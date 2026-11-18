import type { StoryDTO, StoryFeedDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { MAX_BROWSER_TIMEOUT_MS } from "../../constants/message";
import { useSocketEvent } from "../../hooks/use-socket-event";
import { EMPTY_STORY_FEED as EMPTY_FEED, STORY_REFRESH_DEBOUNCE_MS } from "../constants/stories";
import { dropExpiredStories } from "../utils/drop-expired-stories";

interface Stories {
	feed: StoryFeedDTO;
	refresh: () => void;
	/** Marks a story seen at once and tells the server; the ring updates without waiting. */
	markViewed: (story: StoryDTO) => void;
	/** Puts the note you just posted in place of your last one, ahead of the nudge that follows. */
	upsertMine: (story: StoryDTO) => void;
	/** Shows a heart at once; the server call runs alongside and is undone if it fails. */
	setLiked: (story: StoryDTO, isLiked: boolean) => void;
	removeMine: (storyId: string) => void;
}

/**
 * The notes row for the signed-in person.
 *
 * The server's `story:changed` only says "refetch" — the row is filtered per
 * viewer, so a broadcast copy could not be right for everyone — and a burst of
 * nudges becomes one request. Anything past its 24 hours leaves on this clock,
 * so the row never shows a story the server would already refuse.
 */
export function useStories(currentUserId: string): Stories {
	const [feed, setFeed] = useState<StoryFeedDTO>(EMPTY_FEED);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const requestRef = useRef(0);

	const load = useCallback(async () => {
		const request = ++requestRef.current;
		try {
			const next = await api.getStoryFeed();
			// A slower, older response must not overwrite a newer one.
			if (request === requestRef.current) setFeed(dropExpiredStories(next));
		} catch {
			// The row is optional chrome; a failed refresh keeps the last good one.
		}
	}, []);

	const refresh = useCallback(() => {
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => void load(), STORY_REFRESH_DEBOUNCE_MS);
	}, [load]);

	useEffect(() => {
		setFeed(EMPTY_FEED);
		void load();
		const onVisible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			clearTimeout(debounceRef.current);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [currentUserId, load, refresh]);

	useSocketEvent("story:changed", refresh);

	useEffect(() => {
		const expiries = [...feed.mine, ...feed.authors.flatMap((group) => group.stories)].map((story) =>
			Date.parse(story.expiresAt),
		);
		if (expiries.length === 0) return;
		const timer = setTimeout(
			() => setFeed((current) => dropExpiredStories(current)),
			Math.min(Math.max(Math.min(...expiries) - Date.now(), 0), MAX_BROWSER_TIMEOUT_MS),
		);

		return () => clearTimeout(timer);
	}, [feed]);

	const markViewed = useCallback((story: StoryDTO) => {
		if (story.isViewed) return;
		setFeed((current) => ({
			...current,
			authors: current.authors.map((group) => {
				if (group.author.id !== story.author.id) return group;
				const stories = group.stories.map((item) =>
					item.id === story.id ? { ...item, isViewed: true } : item,
				);

				return { ...group, stories, hasUnseen: stories.some((item) => !item.isViewed) };
			}),
		}));
		void api.viewStory(story.id).catch(() => undefined);
	}, []);

	const upsertMine = useCallback((story: StoryDTO) => {
		// One note per person: the server has already replaced the last one.
		setFeed((current) => ({ ...current, mine: [story] }));
	}, []);

	const setLiked = useCallback((story: StoryDTO, isLiked: boolean) => {
		const apply = (value: boolean) =>
			setFeed((current) => ({
				...current,
				authors: current.authors.map((group) => ({
					...group,
					stories: group.stories.map((item) => (item.id === story.id ? { ...item, isLiked: value } : item)),
				})),
			}));
		apply(isLiked);
		(isLiked ? api.likeStory(story.id) : api.unlikeStory(story.id)).catch(() => apply(!isLiked));
	}, []);

	const removeMine = useCallback((storyId: string) => {
		setFeed((current) => ({ ...current, mine: current.mine.filter((item) => item.id !== storyId) }));
	}, []);

	return { feed, refresh, markViewed, upsertMine, setLiked, removeMine };
}
