import type { StoryAudienceSettingsDTO } from "@chatty/shared-types";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { StoryPeopleList } from "@/types/story-people";
import { getErrorMessage } from "@/utils/get-error-message";

interface StoryPeopleLists {
	/** Null until loaded. */
	settings: StoryAudienceSettingsDTO | null;
	selected: Record<StoryPeopleList, ReadonlySet<string>>;
	toggle: (list: StoryPeopleList, userId: string, isSelected: boolean) => void;
	error: string;
}

const SAVE: Record<StoryPeopleList, (userIds: string[]) => Promise<unknown>> = {
	close_friends: (userIds) => api.setCloseFriends(userIds),
	hidden: (userIds) => api.setStoryHiddenFrom(userIds),
};

/**
 * Your close friends and "hide notes from" lists, saved the moment a person is
 * tapped, as on Instagram. Saves run one at a time in tap order, each sending
 * the whole list as it stood, so a quick run of taps cannot land out of order.
 * A refused save puts that list back and says so.
 */
export function useStoryPeopleLists(): StoryPeopleLists {
	const [settings, setSettings] = useState<StoryAudienceSettingsDTO | null>(null);
	const [selected, setSelected] = useState<Record<StoryPeopleList, ReadonlySet<string>>>({
		close_friends: new Set(),
		hidden: new Set(),
	});
	const [error, setError] = useState("");
	const selectedRef = useRef(selected);
	const queueRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		let isCurrent = true;
		api.getStoryAudienceSettings()
			.then((loaded) => {
				if (!isCurrent) return;
				const lists = { close_friends: new Set(loaded.closeFriendIds), hidden: new Set(loaded.hiddenIds) };
				selectedRef.current = lists;
				setSelected(lists);
				setSettings(loaded);
			})
			.catch((loadError: unknown) => {
				if (isCurrent) setError(getErrorMessage(loadError, "Your lists could not be loaded."));
			});

		return () => {
			isCurrent = false;
		};
	}, []);

	function toggle(list: StoryPeopleList, userId: string, isSelected: boolean) {
		const before = selectedRef.current[list];
		const after = new Set(before);
		if (isSelected) after.add(userId);
		else after.delete(userId);
		const next = { ...selectedRef.current, [list]: after };
		selectedRef.current = next;
		setSelected(next);
		setError("");
		queueRef.current = queueRef.current.then(async () => {
			try {
				await SAVE[list]([...after]);
			} catch (saveError) {
				const reverted = { ...selectedRef.current, [list]: before };
				selectedRef.current = reverted;
				setSelected(reverted);
				setError(getErrorMessage(saveError, "That change could not be saved. Try again."));
			}
		});
	}

	return { settings, selected, toggle, error };
}
