import { ArrowRight, MessagesSquare } from "lucide-react";
import { AmbientBackground } from "@/components/ambient-background";
import { Button } from "@/components/button";

export function ChatWelcome() {
	return (
		<section className="chat-welcome" aria-label="Welcome to your chats">
			<AmbientBackground />
			<div className="welcome-content">
				<span className="welcome-icon" aria-hidden="true">
					<MessagesSquare />
				</span>
				<h1>
					A little closer,
					<br />
					one conversation at a time.
				</h1>
				<p>
					Choose a chat on the left, or find someone
					<br className="hidden sm:block" /> to share your day with.
				</p>
				<Button
					className="welcome-cta"
					onClick={() => document.getElementById("global-conversation-search")?.focus()}
				>
					Find your people <ArrowRight size={16} aria-hidden="true" />
				</Button>
			</div>
		</section>
	);
}
