import type { UserDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PEOPLE_SEARCH_DEBOUNCE_MS } from "../constants/friends";

interface PeopleSearch {
	people: UserDTO[];
	isSearching: boolean;
}

/** People matching a name or handle, after a pause in typing; a newer query drops an older answer. */
export function usePeopleSearch(query: string): PeopleSearch {
	const [people, setPeople] = useState<UserDTO[]>([]);
	const [isSearching, setIsSearching] = useState(false);

	useEffect(() => {
		const words = query.trim();
		if (!words) {
			setPeople([]);
			setIsSearching(false);

			return;
		}
		let isCurrent = true;
		setIsSearching(true);
		const timer = window.setTimeout(() => {
			api.searchUsers(words)
				.then((found) => isCurrent && setPeople(found))
				.catch(() => isCurrent && setPeople([]))
				.finally(() => isCurrent && setIsSearching(false));
		}, PEOPLE_SEARCH_DEBOUNCE_MS);

		return () => {
			isCurrent = false;
			window.clearTimeout(timer);
		};
	}, [query]);

	return { people, isSearching };
}
