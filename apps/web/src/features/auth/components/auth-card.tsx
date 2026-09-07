import type { ReactNode } from "react";
import { ArrowDownRight, Heart, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/brand";
import { HelloCollage } from "@/components/hello-collage";

interface AuthCardProps {
	title: string;
	description?: string;
	children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
	return (
		<main className="auth-world">
			<header className="auth-masthead">
				<Link to="/login" aria-label="Chatty home">
					<Brand />
				</Link>
				<span className="auth-masthead-note">A LITTLE CORNER OF THE INTERNET, JUST FOR YOU.</span>
				<span className="club-label">
					<Sparkles size={14} aria-hidden="true" /> THE GOOD COMPANY CLUB
				</span>
			</header>
			<div className="auth-layout">
				<section className="auth-story" aria-label="Welcome to Chatty">
					<div className="story-kicker">
						<span className="little-star" aria-hidden="true">
							✳
						</span>{" "}
						LESS SCROLLING. MORE CONNECTING.
					</div>
					<h2>
						Life is colorful.
						<br />
						Your chats
						<br /> should be <em>too.</em>
						<span className="heading-spark" aria-hidden="true">
							✴
						</span>
					</h2>
					<p>
						A place for the big news, the little things,
						<br className="hidden sm:block" /> and the people who make it all worthwhile.
					</p>
					<HelloCollage />
					<div className="story-footnote">
						<span>COME AS YOU ARE. STAY FOR A CHAT.</span>
						<ArrowDownRight size={25} aria-hidden="true" />
					</div>
				</section>
				<section className="auth-form-side" aria-label={title}>
					<span className="auth-floating-star" aria-hidden="true">
						✳
					</span>
					<div className="auth-form-card">
						<div className="auth-card-ribbon" aria-hidden="true" />
						<div className="auth-card-intro">
							<span className="eyebrow">MAKE YOURSELF AT HOME</span>
							<Heart size={20} aria-hidden="true" />
						</div>
						<h1>{title}</h1>
						{description && <p className="auth-description">{description}</p>}
						<div className="auth-fields">{children}</div>
						<div className="auth-card-footer">
							<span aria-hidden="true">✶</span> A good conversation starts with you.
						</div>
					</div>
					<p className="auth-side-note">Real people. Little moments. A lot of heart.</p>
				</section>
			</div>
			<footer className="auth-footer">
				<span>MADE FOR YOUR EVERYDAY PEOPLE.</span>
				<span>
					STAY A LITTLE. SAY A LOT. <Heart size={12} aria-hidden="true" />
				</span>
			</footer>
		</main>
	);
}
