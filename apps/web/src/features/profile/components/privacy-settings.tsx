import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { useRef, useState } from "react";
import { api } from "@/api/client";
import { MessageTimerPicker } from "@/components/message-timer-picker";
import { SegmentedControl } from "@/components/segmented-control";
import { Switch } from "@/components/switch";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/utils/get-error-message";
import { PRESENCE_VISIBILITY_OPTIONS } from "../constants/presence-visibility";
import { pick } from "../utils/pick";
import { PrivacySettingRow } from "./privacy-setting-row";

interface PrivacySettingsProps {
	user: CurrentUserDTO;
}

/**
 * Who sees what you do, and what others may do with what you write.
 *
 * Every control applies the moment it changes — no Save button for choices that
 * are each one tap. The new value shows at once and rolls back with a reason if
 * the server refuses it. Each symmetric setting says so in its sentence: being
 * surprised by the symmetry afterwards is what makes a setting feel like a trick.
 */
export function PrivacySettings({ user }: PrivacySettingsProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const [error, setError] = useState("");
	// One request at a time, in the order chosen, so a quick second tap cannot
	// land before the first and leave the server holding the older value.
	const queueRef = useRef<Promise<void>>(Promise.resolve());

	function save(change: UpdateProfileRequest) {
		const current = useAuth.getState().currentUser ?? user;
		const reverted = pick(current, change);
		setError("");
		setCurrentUser({ ...current, ...change } as CurrentUserDTO);
		queueRef.current = queueRef.current.then(async () => {
			try {
				const saved = await api.updateProfile(change);
				// Only this change's keys: a later tap already shown on screen must not be undone.
				setCurrentUser({ ...(useAuth.getState().currentUser ?? saved), ...pick(saved, change) });
			} catch (saveError) {
				setCurrentUser({ ...(useAuth.getState().currentUser ?? current), ...reverted } as CurrentUserDTO);
				setError(getErrorMessage(saveError, "The setting could not be saved. Try again."));
			}
		});
	}

	return (
		<div className="flex flex-col divide-y divide-rule-soft">
			<PrivacySettingRow
				label="Read receipts"
				description="Off hides your “Seen” from everyone, and hides theirs from you."
				control={
					<Switch
						label="Read receipts"
						isOn={user.readReceiptsEnabled}
						onChange={(readReceiptsEnabled) => void save({ readReceiptsEnabled })}
					/>
				}
			/>
			<PrivacySettingRow
				label="Typing indicator"
				description="Off hides that you're typing, and hides others typing from you."
				control={
					<Switch
						label="Typing indicator"
						isOn={user.typingIndicatorsEnabled}
						onChange={(typingIndicatorsEnabled) => void save({ typingIndicatorsEnabled })}
					/>
				}
			/>
			<PrivacySettingRow
				label="Allow forwarding"
				description="Off stops others forwarding your messages, including ones already sent. Copying text and screenshots can't be fully stopped."
				control={
					<Switch
						label="Allow forwarding"
						isOn={user.allowMessageForwarding}
						onChange={(allowMessageForwarding) => void save({ allowMessageForwarding })}
					/>
				}
			/>
			<PrivacySettingRow
				label="Last seen"
				labelId="privacy-last-seen"
				description="Online status is still shown while you're connected."
				isStacked
				control={
					<SegmentedControl
						options={PRESENCE_VISIBILITY_OPTIONS}
						value={user.presenceVisibility}
						labelledBy="privacy-last-seen"
						onChange={(presenceVisibility) => void save({ presenceVisibility })}
					/>
				}
			/>
			<PrivacySettingRow
				label="Disappearing messages for new chats"
				labelId="privacy-message-timer"
				description="Chats you start use this. They show it as your default for every new chat, so nobody reads it as aimed at them."
				isStacked
				control={
					<MessageTimerPicker
						value={user.defaultMessageTimerSeconds}
						labelledBy="privacy-message-timer"
						onChange={(defaultMessageTimerSeconds) => void save({ defaultMessageTimerSeconds })}
					/>
				}
			/>
			{error && (
				<p role="alert" className="pt-4 text-[13px] text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
