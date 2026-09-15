import { getMessageDraftKey } from "@/lib/message-drafts";
import { useEffect, useState } from "react";
import { DRAFT_CHANGED_EVENT } from "../constants/draft";
import { getDraftPreview } from "../utils/draft-preview";

interface DraftPreviewChange {
	userId: string;
	conversationId: string;
	preview: string | null;
}

interface DraftPreviewState {
	userId: string;
	previews: Record<string, string | null>;
}

/** Only inspect loaded sidebar rows; message updates do not re-read storage. */
export function useDraftPreviews(userId: string, conversationIds: string[]) {
	const idsKey = JSON.stringify([...conversationIds].sort());
	const [state, setState] = useState<DraftPreviewState>({ userId, previews: {} });

	useEffect(() => {
		const ids: string[] = JSON.parse(idsKey);
		const knownIds = new Set(ids);
		function readPreviews(isExternalChange = false) {
			const next: Record<string, string | null> = {};
			for (const id of ids) {
				try {
					next[id] = getDraftPreview(localStorage.getItem(getMessageDraftKey(userId, id)));
				} catch {
					next[id] = null;
				}
			}
			// A socket arrival may add/reorder rows before the save debounce fires.
			// Keep same-tab previews for existing rows instead of reviving old disk text.
			setState((state) => {
				const current = state.userId === userId ? state.previews : {};

				return {
					userId,
					previews: Object.fromEntries(
						ids.map((id) => [
							id,
							(!isExternalChange && Object.hasOwn(current, id) ? current[id] : next[id]) ?? null,
						]),
					),
				};
			});
		}
		function handleChange(event: Event) {
			const change = (event as CustomEvent<DraftPreviewChange>).detail;
			if (change.userId !== userId || !knownIds.has(change.conversationId)) return;
			setState((state) => ({
				userId,
				previews: {
					...(state.userId === userId ? state.previews : {}),
					[change.conversationId]: change.preview,
				},
			}));
		}
		function handleStorage(event: StorageEvent) {
			if (event.key === null || ids.some((id) => event.key === getMessageDraftKey(userId, id)))
				readPreviews(true);
		}
		readPreviews();
		window.addEventListener(DRAFT_CHANGED_EVENT, handleChange);
		window.addEventListener("storage", handleStorage);

		return () => {
			window.removeEventListener(DRAFT_CHANGED_EVENT, handleChange);
			window.removeEventListener("storage", handleStorage);
		};
	}, [userId, idsKey]);

	return state.userId === userId ? state.previews : {};
}
