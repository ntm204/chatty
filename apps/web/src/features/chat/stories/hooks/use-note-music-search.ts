import type { NoteMusicDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { getErrorMessage } from "@/utils/get-error-message";
import { NOTE_MUSIC_SEARCH_DEBOUNCE_MS } from "../constants/story-composer";

interface NoteMusicSearch {
	tracks: NoteMusicDTO[];
	isLoading: boolean;
	error: string;
}

/**
 * Songs for `query`, or the Vietnamese chart while it is empty. Waits for a
 * pause in typing and cancels the request a newer query replaces, so results
 * never arrive out of order.
 */
export function useNoteMusicSearch(query: string): NoteMusicSearch {
	const [state, setState] = useState<NoteMusicSearch>({ tracks: [], isLoading: true, error: "" });

	useEffect(() => {
		const controller = new AbortController();
		setState((current) => ({ ...current, isLoading: true, error: "" }));
		const timer = window.setTimeout(
			() => {
				api.searchNoteMusic(query.trim(), controller.signal)
					.then(({ tracks }) => setState({ tracks, isLoading: false, error: "" }))
					.catch((searchError: unknown) => {
						if (controller.signal.aborted) return;
						setState({
							tracks: [],
							isLoading: false,
							error: getErrorMessage(searchError, "Music is not available right now."),
						});
					});
			},
			query.trim() ? NOTE_MUSIC_SEARCH_DEBOUNCE_MS : 0,
		);

		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [query]);

	return state;
}
