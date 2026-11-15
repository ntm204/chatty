import type { StoryDTO } from "@chatty/shared-types";
import { useEffect } from "react";

/**
 * Warms the browser cache for the story after this one — only that one, so a
 * row of twenty stories costs one extra download at a time rather than twenty
 * on opening (ADR 0016). A video's poster is fetched, not the video: the file
 * itself starts streaming the moment it is shown, thanks to `+faststart`.
 */
export function usePrefetchNextStory(next: StoryDTO | undefined): void {
	useEffect(() => {
		const url = next?.media ? (next.media.posterUrl ?? next.media.url) : null;
		if (!url) return;
		const image = new Image();
		image.src = url;
	}, [next?.id]);
}
