import type { CurrentUserDTO } from "@chatty/shared-types";
import { useState } from "react";
import { useStories } from "../hooks/use-stories";
import type { OpenStoryViewer, StoryGroup } from "../types/story-viewer";
import { firstUnseenIndex } from "../utils/advance-story";
import { StoryComposer } from "./story-composer";
import { StoryRing } from "./story-ring";
import { StoryViewer } from "./story-viewer";

interface StoriesBarProps {
	currentUser: CurrentUserDTO;
}

/**
 * The stories row above the chat list: post one, watch yours, then the people
 * you chat with — unseen first. A story's words float above the face in a
 * message bubble (Instagram Notes' place for them); the ring says what is new.
 */
export function StoriesBar({ currentUser }: StoriesBarProps) {
	const { feed, markViewed, upsertMine, removeMine } = useStories(currentUser.id);
	const [viewer, setViewer] = useState<OpenStoryViewer | null>(null);
	const [isComposing, setIsComposing] = useState(false);
	const mine: StoryGroup = { author: currentUser, stories: feed.mine };
	const liveGroups = (viewer?.authorIds ?? []).flatMap((authorId) =>
		authorId === currentUser.id ? [mine] : feed.authors.filter((group) => group.author.id === authorId),
	);

	return (
		<>
			<div
				role="group"
				aria-label="Notes"
				className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-1 pb-2 scrollbar-none"
			>
				<div>
					<StoryRing
						user={currentUser}
						label="New note"
						caption={feed.mine.length > 0 ? "New" : "Your note"}
						hasNotePrompt={feed.mine.length === 0}
						state="none"
						hasAddBadge
						onClick={() => setIsComposing(true)}
					/>
				</div>
				{feed.mine.length > 0 && (
					<div>
						<StoryRing
							user={currentUser}
							label="Your note"
							caption="Your note"
							noteText={feed.mine.at(-1)?.text ?? null}
							music={feed.mine.at(-1)?.music ?? null}
							state="seen"
							isMine
							onClick={() =>
								setViewer({ authorIds: [currentUser.id], start: { groupIndex: 0, storyIndex: 0 } })
							}
						/>
					</div>
				)}
				{feed.authors.map((group, groupIndex) => (
					<div key={group.author.id}>
						<StoryRing
							user={group.author}
							label={`${group.author.displayName}'s note${group.hasUnseen ? ", new" : ""}`}
							caption={group.author.displayName}
							noteText={group.stories.at(-1)?.text ?? null}
							music={group.stories.at(-1)?.music ?? null}
							state={group.hasUnseen ? "unseen" : "seen"}
							onClick={() =>
								setViewer({
									authorIds: feed.authors.map((item) => item.author.id),
									start: { groupIndex, storyIndex: firstUnseenIndex(group) },
								})
							}
						/>
					</div>
				))}
			</div>

			{viewer && (
				<StoryViewer
					groups={liveGroups}
					start={viewer.start}
					currentUserId={currentUser.id}
					onViewed={markViewed}
					onOwnChanged={upsertMine}
					onOwnDeleted={removeMine}
					onClose={() => setViewer(null)}
				/>
			)}
			{isComposing && (
				<StoryComposer currentUser={currentUser} onPosted={upsertMine} onClose={() => setIsComposing(false)} />
			)}
		</>
	);
}
