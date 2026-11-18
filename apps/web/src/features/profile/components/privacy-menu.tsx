import type { CurrentUserDTO } from "@chatty/shared-types";
import { Ban, CheckCheck, Clock, Eye, EyeOff, Forward, MessageCircleMore, Star, UserX } from "lucide-react";
import { DISAPPEARING_OPTIONS } from "../constants/privacy";
import { PRESENCE_VISIBILITY_OPTIONS } from "../constants/presence-visibility";
import type { PrivacyPage } from "../types/settings";
import { onOffLabel, peopleCountLabel } from "../utils/privacy-values";
import { PrivacyMenuRow } from "./privacy-menu-row";

interface PrivacyMenuProps {
	user: CurrentUserDTO;
	/** Null while the note lists load: the rows show no count rather than a wrong one. */
	closeFriendCount: number | null;
	hiddenCount: number | null;
	onOpen: (page: PrivacyPage) => void;
}

/**
 * Instagram's privacy page: settings grouped by who they are about, each a row
 * with its current value and a chevron to its own page — the list reads as a
 * summary of your privacy before you change anything.
 */
export function PrivacyMenu({ user, closeFriendCount, hiddenCount, onOpen }: PrivacyMenuProps) {
	const activeStatus = PRESENCE_VISIBILITY_OPTIONS.find((option) => option.value === user.presenceVisibility);
	const timer = DISAPPEARING_OPTIONS.find((option) => option.value === user.defaultMessageTimerSeconds);

	return (
		<div className="flex flex-col gap-6">
			<section aria-labelledby="privacy-activity" className="flex flex-col">
				<h3 id="privacy-activity" className="meta px-3 pb-1 font-medium text-ink-soft">
					Who can see your activity
				</h3>
				<PrivacyMenuRow
					icon={Eye}
					label="Active status"
					value={activeStatus?.label}
					onOpen={() => onOpen("active_status")}
				/>
				<PrivacyMenuRow
					icon={CheckCheck}
					label="Read receipts"
					value={onOffLabel(user.readReceiptsEnabled)}
					onOpen={() => onOpen("read_receipts")}
				/>
				<PrivacyMenuRow
					icon={MessageCircleMore}
					label="Typing indicator"
					value={onOffLabel(user.typingIndicatorsEnabled)}
					onOpen={() => onOpen("typing")}
				/>
			</section>

			<section aria-labelledby="privacy-notes" className="flex flex-col">
				<h3 id="privacy-notes" className="meta px-3 pb-1 font-medium text-ink-soft">
					Who can see your notes
				</h3>
				<PrivacyMenuRow
					icon={Star}
					label="Close friends"
					value={peopleCountLabel(closeFriendCount)}
					onOpen={() => onOpen("close_friends")}
				/>
				<PrivacyMenuRow
					icon={EyeOff}
					label="Hide notes from"
					value={peopleCountLabel(hiddenCount)}
					onOpen={() => onOpen("hidden")}
				/>
			</section>

			<section aria-labelledby="privacy-interactions" className="flex flex-col">
				<h3 id="privacy-interactions" className="meta px-3 pb-1 font-medium text-ink-soft">
					How others can interact with you
				</h3>
				<PrivacyMenuRow
					icon={Forward}
					label="Forwarding"
					value={user.allowMessageForwarding ? "Allowed" : "Off"}
					onOpen={() => onOpen("sharing")}
				/>
				<PrivacyMenuRow
					icon={Clock}
					label="Disappearing messages"
					value={timer?.label}
					onOpen={() => onOpen("disappearing")}
				/>
				<PrivacyMenuRow icon={UserX} label="Restricted accounts" onOpen={() => onOpen("restricted")} />
				<PrivacyMenuRow icon={Ban} label="Blocked accounts" onOpen={() => onOpen("blocked")} />
			</section>
		</div>
	);
}
