import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { ThreadMessage } from "../types/thread-message";
import { SYSTEM_MESSAGE_COLLAPSE_THRESHOLD } from "../utils/system-message-runs";
import { SystemMessage } from "./system-message";

export function SystemMessageGroup({ messages }: { messages: ThreadMessage[] }) {
	const [isOpen, setIsOpen] = useState(false);
	const contentId = useId();
	if (messages.length < SYSTEM_MESSAGE_COLLAPSE_THRESHOLD) {
		return messages.map((message) => (
			<SystemMessage key={message.id} content={message.content} createdAt={message.createdAt} />
		));
	}
	return (
		<div className="w-full py-2 text-xs text-ink-faint">
			<button
				type="button"
				aria-expanded={isOpen}
				aria-controls={contentId}
				onClick={() => setIsOpen((value) => !value)}
				className="mx-auto flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 hover:bg-paper-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30"
			>
				<span>{messages.length} chat updates</span>
				<ChevronDown
					aria-hidden="true"
					className={`size-3.5 motion-safe:transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>
			<div id={contentId} hidden={!isOpen}>
				{messages.map((message) => (
					<SystemMessage key={message.id} content={message.content} createdAt={message.createdAt} />
				))}
			</div>
		</div>
	);
}
