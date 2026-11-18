import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { PeoplePicker } from "@/components/people-picker";
import { RadioList } from "@/components/radio-list";
import { Switch } from "@/components/switch";
import type { useStoryPeopleLists } from "@/hooks/use-story-people-lists";
import { DISAPPEARING_OPTIONS } from "../constants/privacy";
import { PRESENCE_VISIBILITY_OPTIONS } from "../constants/presence-visibility";
import type { PrivacyPage } from "../types/settings";
import { BlockedUsersSettings } from "./blocked-users-settings";
import { PrivacySettingRow } from "./privacy-setting-row";
import { PrivacySubpage } from "./privacy-subpage";
import { RestrictedUsersSettings } from "./restricted-users-settings";

interface PrivacyPageViewProps {
	page: PrivacyPage;
	user: CurrentUserDTO;
	lists: ReturnType<typeof useStoryPeopleLists>;
	save: (change: UpdateProfileRequest) => void;
	onBack: () => void;
}

/** The page one Privacy row opens. Every control applies the moment it changes, as on Instagram. */
export function PrivacyPageView({ page, user, lists, save, onBack }: PrivacyPageViewProps) {
	switch (page) {
		case "active_status": {
			return (
				<PrivacySubpage
					title="Active status"
					description="When you were last active. Your online dot still shows while you're connected."
					onBack={onBack}
				>
					{(headingId) => (
						<RadioList
							options={PRESENCE_VISIBILITY_OPTIONS}
							value={user.presenceVisibility}
							labelledBy={headingId}
							onChange={(presenceVisibility) => save({ presenceVisibility })}
						/>
					)}
				</PrivacySubpage>
			);
		}
		case "read_receipts": {
			return (
				<PrivacySubpage title="Read receipts" onBack={onBack}>
					{() => (
						<PrivacySettingRow
							label="Show read receipts"
							description="Off hides your “Seen” from everyone, and hides theirs from you."
							control={
								<Switch
									label="Read receipts"
									isOn={user.readReceiptsEnabled}
									onChange={(readReceiptsEnabled) => save({ readReceiptsEnabled })}
								/>
							}
						/>
					)}
				</PrivacySubpage>
			);
		}
		case "typing": {
			return (
				<PrivacySubpage title="Typing indicator" onBack={onBack}>
					{() => (
						<PrivacySettingRow
							label="Show when you're typing"
							description="Off hides that you're typing, and hides others typing from you."
							control={
								<Switch
									label="Typing indicator"
									isOn={user.typingIndicatorsEnabled}
									onChange={(typingIndicatorsEnabled) => save({ typingIndicatorsEnabled })}
								/>
							}
						/>
					)}
				</PrivacySubpage>
			);
		}
		case "sharing": {
			return (
				<PrivacySubpage title="Forwarding" onBack={onBack}>
					{() => (
						<PrivacySettingRow
							label="Allow forwarding"
							description="Off stops others forwarding your messages, including ones already sent. Copying text and screenshots can't be fully stopped."
							control={
								<Switch
									label="Allow forwarding"
									isOn={user.allowMessageForwarding}
									onChange={(allowMessageForwarding) => save({ allowMessageForwarding })}
								/>
							}
						/>
					)}
				</PrivacySubpage>
			);
		}
		case "disappearing": {
			return (
				<PrivacySubpage
					title="Disappearing messages"
					description="The default for chats you start. They show it as your habit for every new chat, so nobody reads it as aimed at them."
					onBack={onBack}
				>
					{(headingId) => (
						<RadioList
							options={DISAPPEARING_OPTIONS}
							value={user.defaultMessageTimerSeconds}
							labelledBy={headingId}
							onChange={(defaultMessageTimerSeconds) => save({ defaultMessageTimerSeconds })}
						/>
					)}
				</PrivacySubpage>
			);
		}
		case "close_friends":
		case "hidden": {
			const isCloseFriends = page === "close_friends";

			return (
				<PrivacySubpage
					title={isCloseFriends ? "Close friends" : "Hide notes from"}
					description={
						isCloseFriends
							? "Only these people see notes you share with close friends. Nobody is told they were added or removed."
							: "These people never see your notes. Nobody is told."
					}
					onBack={onBack}
				>
					{() =>
						lists.settings ? (
							<PeoplePicker
								people={lists.settings.contacts}
								selectedIds={lists.selected[page]}
								onToggle={(userId, isSelected) => lists.toggle(page, userId, isSelected)}
								listName={isCloseFriends ? "close friends" : "hidden"}
								emptyText="People you chat with appear here."
							/>
						) : (
							<p className="text-sm text-ink-faint">{lists.error || "Loading…"}</p>
						)
					}
				</PrivacySubpage>
			);
		}
		case "restricted": {
			return (
				<PrivacySubpage title="Restricted accounts" onBack={onBack}>
					{() => <RestrictedUsersSettings />}
				</PrivacySubpage>
			);
		}
		case "blocked": {
			return (
				<PrivacySubpage title="Blocked accounts" onBack={onBack}>
					{() => <BlockedUsersSettings />}
				</PrivacySubpage>
			);
		}
	}
}
