import { ArrowRight, ChevronDown, WifiOff } from "lucide-react";
import { useState } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Button } from "@/components/button";

interface ChatWelcomeProps {
	unreadCount: number;
	isConnectionLost: boolean;
	/** True once the list has loaded and holds nothing, so the next step is finding a person. */
	hasNoConversations: boolean;
	/** A link or reload named a conversation this account can no longer open. */
	isUnavailable?: boolean;
	onOpenUnread?: (() => void) | undefined;
}

/**
 * The pane before a chat is picked. The one next step is always on screen as a
 * button; it used to sit behind the status island, so a new account was told to
 * "choose a chat on the left" above a list that said it had none.
 */
export function ChatWelcome({
	unreadCount,
	isConnectionLost,
	hasNoConversations,
	isUnavailable = false,
	onOpenUnread,
}: ChatWelcomeProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const status = isConnectionLost
		? "Reconnecting…"
		: unreadCount > 0
			? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
			: "Your quiet corner";

	return (
		<section className="chat-welcome" aria-label="Welcome to your chats">
			<AmbientBackground />
			<div className="welcome-content">
				<div className="welcome-island" data-expanded={isExpanded} data-offline={isConnectionLost}>
					<Button
						variant="ghost"
						className="welcome-island-toggle text-current hover:bg-transparent"
						aria-label={status}
						aria-expanded={isExpanded}
						aria-controls="welcome-island-details"
						onClick={() => setIsExpanded((value) => !value)}
					>
						{isConnectionLost ? (
							<WifiOff size={16} aria-hidden="true" />
						) : (
							<span className="welcome-island-dot" aria-hidden="true" />
						)}
						<span role="status" aria-live="polite">
							{status}
						</span>
						<ChevronDown className="welcome-island-chevron" size={16} aria-hidden="true" />
					</Button>
					<div className="welcome-island-details" id="welcome-island-details" aria-hidden={!isExpanded}>
						<div>
							<p>
								{isConnectionLost
									? "We’ll reconnect automatically. Your conversations are still here."
									: unreadCount > 0
										? "A conversation is waiting for you. Pick up where you left off."
										: "A little space for your next conversation."}
							</p>
						</div>
					</div>
				</div>
				<h1>
					Your conversations,
					<br />
					one tap away.
				</h1>
				{isUnavailable && (
					<p role="alert" className="text-signal">
						That conversation isn’t available. It may have been deleted, or you are no longer in it.
					</p>
				)}
				<p>
					{hasNoConversations
						? "Search by name or @handle to start your first conversation."
						: "Choose a chat on the left, or start a new one."}
				</p>
				<Button
					className="welcome-cta"
					onClick={() => {
						if (onOpenUnread) onOpenUnread();
						else document.getElementById("global-conversation-search")?.focus();
					}}
				>
					{onOpenUnread
						? "Open unread chat"
						: hasNoConversations
							? "Find someone to chat with"
							: "Start a new chat"}
					<ArrowRight size={16} aria-hidden="true" />
				</Button>
			</div>
		</section>
	);
}
