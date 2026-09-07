import { ArrowUpRight, Heart, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/button";
import { HelloCollage } from "@/components/hello-collage";

export function ChatWelcome() {
	return (
		<section className="chat-welcome" aria-label="Welcome to your chats">
			<div className="welcome-topline">
				<span className="eyebrow">YOUR DAILY DOSE OF GOOD COMPANY</span>
				<Sparkles size={19} aria-hidden="true" />
			</div>
			<div className="welcome-content">
				<span className="welcome-label">
					<Heart size={13} aria-hidden="true" /> THERE&apos;S NO PLACE LIKE YOUR PEOPLE
				</span>
				<h1>
					Little hellos.
					<br />
					<em>Big connections.</em>
				</h1>
				<p>
					Catch up. Make a plan. Send that silly thought.
					<br />
					There&apos;s a whole conversation waiting to happen.
				</p>
				<HelloCollage />
				<Button
					className="welcome-cta"
					onClick={() => document.getElementById("global-conversation-search")?.focus()}
				>
					<MessageCircle size={17} aria-hidden="true" /> Find your people{" "}
					<ArrowUpRight size={17} aria-hidden="true" />
				</Button>
				<p className="welcome-hint">Pick a conversation, or search for someone to start one.</p>
			</div>
			<div className="welcome-bottomline">
				<span>GOOD CONVERSATIONS LIVE HERE.</span>
				<span aria-hidden="true">✳ &nbsp; ✶ &nbsp; ✳</span>
				<span>MAKE A LITTLE TIME.</span>
			</div>
		</section>
	);
}
