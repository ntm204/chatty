import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { WELCOME_FALLBACK_MS } from "../constants/welcome-intro";

interface WelcomeIntroProps {
	onComplete: () => void;
}

export function WelcomeIntro({ onComplete }: WelcomeIntroProps) {
	const dialogRef = useDialog<HTMLDivElement>(onComplete);

	useEffect(() => {
		const fallback = window.setTimeout(onComplete, WELCOME_FALLBACK_MS);
		const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		function finishIfReduced() {
			if (preference?.matches) onComplete();
		}
		preference?.addEventListener("change", finishIfReduced);

		return () => {
			window.clearTimeout(fallback);
			preference?.removeEventListener("change", finishIfReduced);
		};
	}, [onComplete]);

	return (
		<div
			ref={dialogRef}
			role="dialog"
			aria-modal="true"
			aria-label="Welcome to Chatty"
			tabIndex={-1}
			className="welcome-intro"
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget && event.animationName === "welcome-curtain") onComplete();
			}}
		>
			<div className="welcome-intro-scene">
				<p className="welcome-intro-label">Well, hello there.</p>
				<div className="welcome-intro-logo">
					<Brand hasSeparateLetters />
				</div>
				<p className="welcome-intro-note">A little closer starts with hello.</p>
			</div>
			<Button variant="ghost" className="welcome-intro-skip" onClick={onComplete}>
				Skip intro <ArrowRight size={14} aria-hidden="true" />
			</Button>
		</div>
	);
}
