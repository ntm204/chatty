import type { UserDTO } from "@chatty/shared-types";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";

interface PersonRowProps {
	user: UserDTO;
	/** A line under the name: when they asked, or since when you are friends. */
	detail?: string;
	/** Buttons on the right, or underneath when `isStacked`. */
	actions: ReactNode;
	isStacked?: boolean;
}

/** One person in a friends list: face, name, handle or detail, and what you can do. */
export function PersonRow({ user, detail, actions, isStacked = false }: PersonRowProps) {
	return (
		<li className={isStacked ? "flex flex-col gap-2 py-2.5" : "flex items-center gap-3 py-2"}>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Avatar user={user} size="md" />
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-[14px] font-semibold text-ink">{user.displayName}</span>
					<span className="meta truncate text-ink-faint">{detail ?? `@${user.handle}`}</span>
				</div>
			</div>
			<div className="flex shrink-0 gap-1.5">{actions}</div>
		</li>
	);
}
