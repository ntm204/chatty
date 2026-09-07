import { ArrowUpRight, Heart, Music2, Smile, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";

interface HelloCollageProps {
	className?: string;
}

/** Decorative stationery is shared by the welcome screen and the empty inbox. */
export function HelloCollage({ className }: HelloCollageProps) {
	return (
		<div className={cn("hello-collage", className)} aria-hidden="true">
			<div className="collage-orbit" />
			<div className="collage-postcard">
				<div className="postcard-top">
					<span>A LITTLE NOTE FOR YOU</span>
					<Heart size={18} />
				</div>
				<span className="postcard-hello">
					hello,
					<br />
					<em>you!</em>
				</span>
				<div className="postcard-bottom">
					<span>GOOD COMPANY. GREAT STORIES.</span>
					<ArrowUpRight size={24} />
				</div>
			</div>
			<div className="collage-stamp">
				<Smile />
				<span>
					STAY
					<br />
					CONNECTED
				</span>
			</div>
			<div className="collage-note">
				<Music2 size={17} />
				<span>
					your people,
					<br />
					your kind of magic.
				</span>
			</div>
			<div className="collage-bubble">
				so glad you&apos;re here <Heart size={14} fill="currentColor" />
			</div>
			<Sparkles className="collage-spark" />
			<div className="collage-tape" />
		</div>
	);
}
