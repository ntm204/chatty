import type { UserDTO } from "@chatty/shared-types";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

interface StoryRingProps {
	user: UserDTO;
	label: string;
	/** The word under the face; defaults to the person's name. */
	caption?: string;
	/** "unseen" draws the accent ring, "seen" a quiet one, "none" no ring at all. */
	state: "unseen" | "seen" | "none";
	/** Your own tile: a small plus to post another story. */
	hasAddBadge?: boolean;
	onClick: () => void;
}

/** One face in the stories row. The ring is the whole signal: bright for something new, faint once seen. */
export function StoryRing({ user, label, caption, state, hasAddBadge = false, onClick }: StoryRingProps) {
	return (
		<Button
			variant="ghost"
			onClick={onClick}
			aria-label={label}
			className="flex h-auto w-16 shrink-0 flex-col items-center gap-1 rounded-lg p-0.5 font-normal hover:bg-transparent"
		>
			<span
				className={cn(
					"relative rounded-full p-[2px]",
					state === "unseen" && "bg-signal",
					state === "seen" && "bg-rule",
				)}
			>
				<span className="block rounded-full bg-paper-raised p-[2px]">
					<Avatar user={user} size="md" />
				</span>
				{hasAddBadge && (
					<span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-paper-raised bg-ink text-paper-raised">
						<Plus aria-hidden="true" className="size-2.5" strokeWidth={3} />
					</span>
				)}
			</span>
			<span className="meta w-full truncate text-center text-ink-soft">{caption ?? user.displayName}</span>
		</Button>
	);
}
