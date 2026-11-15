import type { StoryViewerDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { getErrorMessage } from "@/utils/get-error-message";
import { formatRelativeTime } from "../../utils/relative-time";

interface StoryViewersSheetProps {
	storyId: string;
	onClose: () => void;
}

/** Who opened your story and shared that they did — newest first. */
export function StoryViewersSheet({ storyId, onClose }: StoryViewersSheetProps) {
	const [viewers, setViewers] = useState<StoryViewerDTO[] | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let isCurrent = true;
		api.listStoryViewers(storyId)
			.then((list) => {
				if (isCurrent) setViewers(list);
			})
			.catch((loadError: unknown) => {
				if (isCurrent) setError(getErrorMessage(loadError, "Viewers could not be loaded."));
			});

		return () => {
			isCurrent = false;
		};
	}, [storyId]);

	return (
		<div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60%] flex-col rounded-t-panel bg-paper-raised text-ink">
			<div className="flex items-center justify-between border-b border-rule px-4 py-3">
				<h3 className="text-sm font-semibold">Viewers</h3>
				<Button variant="ghost" onClick={onClose} aria-label="Close viewers" className="size-8 p-0">
					<X className="size-4" />
				</Button>
			</div>
			<div className="min-h-24 overflow-y-auto p-2">
				{!viewers && !error && <p className="note px-2 py-3 text-ink-faint">Loading…</p>}
				{error && <p className="note px-2 py-3 text-ink-faint">{error}</p>}
				{viewers?.length === 0 && <p className="note px-2 py-3 text-ink-faint">No one yet.</p>}
				{viewers?.map((viewer) => (
					<div key={viewer.user.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
						<Avatar user={viewer.user} size="sm" />
						<span className="min-w-0 flex-1 truncate text-[13px]">{viewer.user.displayName}</span>
						<span className="meta text-ink-faint">{formatRelativeTime(viewer.viewedAt)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
