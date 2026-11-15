import type { StoryAudience, StoryDTO } from "@chatty/shared-types";
import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { SegmentedControl } from "@/components/segmented-control";
import { getErrorMessage } from "@/utils/get-error-message";
import { STORY_AUDIENCE_OPTIONS } from "../constants/stories";

interface StoryOwnerBarProps {
	story: StoryDTO;
	onShowViewers: () => void;
	onChanged: (story: StoryDTO) => void;
	onDeleted: (storyId: string) => void;
}

/** Your own story's controls: who has seen it, who it reaches, and delete. */
export function StoryOwnerBar({ story, onShowViewers, onChanged, onDeleted }: StoryOwnerBarProps) {
	const [error, setError] = useState("");
	const [isBusy, setIsBusy] = useState(false);

	async function run(action: () => Promise<void>) {
		if (isBusy) return;
		setIsBusy(true);
		setError("");
		try {
			await action();
		} catch (actionError) {
			setError(getErrorMessage(actionError, "That did not work. Try again."));
		} finally {
			setIsBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2 text-on-media">
			<div className="flex items-center justify-between gap-2">
				<Button
					variant="ghost"
					onClick={onShowViewers}
					className="gap-1.5 px-2 text-[13px] text-on-media hover:bg-on-media/15 hover:text-on-media"
				>
					<Eye className="size-4" />
					{story.viewCount ?? 0}
				</Button>
				<span id={`story-audience-${story.id}`} className="sr-only">
					Who can see this story
				</span>
				<SegmentedControl<StoryAudience>
					options={STORY_AUDIENCE_OPTIONS}
					value={story.audience ?? "contacts"}
					labelledBy={`story-audience-${story.id}`}
					onChange={(audience) =>
						void run(async () => onChanged(await api.setStoryAudience(story.id, audience)))
					}
				/>
				<Button
					variant="ghost"
					onClick={() =>
						void run(async () => {
							await api.deleteStory(story.id);
							onDeleted(story.id);
						})
					}
					aria-label="Delete story"
					className="size-9 p-0 text-on-media hover:bg-on-media/15 hover:text-on-media"
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
			{error && (
				<p role="alert" className="note text-center text-on-media/80">
					{error}
				</p>
			)}
		</div>
	);
}
