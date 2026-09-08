import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AmbientBackground } from "@/components/ambient-background";
import { Brand } from "@/components/brand";
import { Button } from "@/components/button";

interface AuthCardProps {
	title: string;
	description?: string;
	children: ReactNode;
	onCreateAccount?: () => void;
}

export function AuthCard({ title, description, children, onCreateAccount }: AuthCardProps) {
	return (
		<main className="auth-world">
			<div className="auth-stage">
				<AmbientBackground />
				<header className="auth-masthead">
					<Link to="/login" aria-label="Chatty home">
						<Brand />
					</Link>
					<nav aria-label="Main navigation" className="auth-nav">
						<Link to="/forgot-password">Account help</Link>
					</nav>
					{onCreateAccount ? (
						<Button variant="outline" className="auth-nav-cta" onClick={onCreateAccount}>
							Get started <ArrowRight size={15} aria-hidden="true" />
						</Button>
					) : (
						<Link className="auth-nav-link" to="/login">
							Sign in <ArrowRight size={15} aria-hidden="true" />
						</Link>
					)}
				</header>
				<div className="auth-layout">
					<section className="auth-story" aria-label="Welcome to Chatty">
						<span className="auth-story-label">A little more together</span>
						<h2>
							A place for
							<br />
							your people.
						</h2>
						<p>
							Catch up, share a moment, or just say hello.
							<br />
							Make time for the conversations that matter.
						</p>
						<span className="auth-story-accent" aria-hidden="true" />
					</section>
					<section className="auth-form-side" aria-label={title}>
						<div className="auth-form-card">
							<h1>{title}</h1>
							{description && <p className="auth-description">{description}</p>}
							<div className="auth-fields">{children}</div>
						</div>
					</section>
				</div>
				<footer className="auth-footer">Your people, one hello away.</footer>
			</div>
		</main>
	);
}
