import type { StoryAuthorDTO, StoryDTO } from "@chatty/shared-types";

/**
 * One note per person, newest first — Messenger's row. The server keeps one
 * note per author already; taking the last is a guard for a row fetched
 * mid-replacement.
 */
export function latestNotes(authors: StoryAuthorDTO[]): StoryDTO[] {
	return authors
		.flatMap((group) => group.stories.at(-1) ?? [])
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
