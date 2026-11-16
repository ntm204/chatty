import type { StoryDTO } from "@chatty/shared-types";
import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { getErrorMessage } from "@/utils/get-error-message";
import { QUICK_STORY_REACTIONS } from "../constants/stories";

interface StoryReplyBarProps {
	story: StoryDTO;
	/** Typing pauses the story, so nobody's reply is cut off by the next one. */
	onFocusChange: (isFocused: boolean) => void;
}

/**
 * Replies and reactions go to the author as a direct message, never a public
 * comment — the story continues a conversation instead of starting a thread.
 */
export function StoryReplyBar({ story, onFocusChange }: StoryReplyBarProps) {
	const [content, setContent] = useState("");
	const [status, setStatus] = useState("");
	const [isSending, setIsSending] = useState(false);

	async function send(text: string) {
		if (!text.trim() || isSending) return;
		setIsSending(true);
		setStatus("");
		try {
			await api.replyToStory(story.id, text.trim());
			setContent("");
			setStatus(`Sent to ${story.author.displayName}`);
		} catch (error) {
			setStatus(getErrorMessage(error, "The reply could not be sent. Try again."));
		} finally {
			setIsSending(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex justify-center gap-1">
				{QUICK_STORY_REACTIONS.map((emoji) => (
					<Button
						key={emoji}
						variant="ghost"
						disabled={isSending}
						onClick={() => void send(emoji)}
						aria-label={`React with ${emoji}`}
						className="size-9 rounded-full p-0 text-[20px] hover:bg-on-media/15"
					>
						{emoji}
					</Button>
				))}
			</div>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void send(content);
				}}
				className="flex items-center gap-2"
			>
				<input
					value={content}
					onChange={(event) => setContent(event.target.value)}
					onFocus={() => onFocusChange(true)}
					onBlur={() => onFocusChange(false)}
					maxLength={4000}
					placeholder={`Reply to ${story.author.displayName}`}
					aria-label="Reply to note"
					className="min-w-0 flex-1 rounded-full border border-on-media/40 bg-transparent px-4 py-2 text-sm text-on-media outline-none placeholder:text-on-media/60 focus:border-on-media"
				/>
				<Button
					type="submit"
					disabled={isSending || !content.trim()}
					aria-label="Send reply"
					className="size-9 shrink-0 rounded-full p-0"
				>
					<ArrowUp className="size-4" />
				</Button>
			</form>
			{status && (
				<p role="status" className="note text-center text-on-media/80">
					{status}
				</p>
			)}
		</div>
	);
}
