import { ArrowRight, ChevronDown, WifiOff } from "lucide-react";
import { useState } from "react";
import { AmbientBackground } from "@/components/ambient-background";
import { Button } from "@/components/button";

interface ChatWelcomeProps {
	unreadCount: number;
	isConnectionLost: boolean;
	onOpenUnread?: (() => void) | undefined;
}

export function ChatWelcome({ unreadCount, isConnectionLost, onOpenUnread }: ChatWelcomeProps) {
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
							<Button
								className="welcome-island-action"
								tabIndex={isExpanded ? 0 : -1}
								onClick={() => {
									if (onOpenUnread) onOpenUnread();
									else document.getElementById("global-conversation-search")?.focus();
								}}
							>
								{onOpenUnread ? "Open unread chat" : "Find your people"}
								<ArrowRight size={16} aria-hidden="true" />
							</Button>
						</div>
					</div>
				</div>
				<h1>
					Your conversations,
					<br />
					one tap away.
				</h1>
				<p>Choose a chat on the left to pick up the conversation.</p>
			</div>
		</section>
	);
}
