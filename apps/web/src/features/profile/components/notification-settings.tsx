import { Button } from "@/components/button";
import { useNotificationSetting } from "@/hooks/use-notification-setting";
import { useSoundSetting } from "@/hooks/use-sound-setting";
import { playMessageChime } from "@/utils/play-message-chime";

/** Sound and desktop-popup controls for an arriving message. Popup permission is per-browser, unlike the rest of this dialog. */
export function NotificationSettings() {
	const isEnabled = useNotificationSetting((state) => state.isEnabled);
	const permission = useNotificationSetting((state) => state.permission);
	const enable = useNotificationSetting((state) => state.enable);
	const disable = useNotificationSetting((state) => state.disable);
	const isSoundEnabled = useSoundSetting((state) => state.isEnabled);
	const enableSound = useSoundSetting((state) => state.enable);
	const disableSound = useSoundSetting((state) => state.disable);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4">
				<p className="text-[13px] text-ink-soft">
					Play a chime when a message arrives and you are not already looking at that conversation.
				</p>
				<div className="flex items-center gap-3">
					<Button
						variant={isSoundEnabled ? "outline" : "primary"}
						onClick={isSoundEnabled ? disableSound : enableSound}
					>
						{isSoundEnabled ? "Turn sound off" : "Turn sound on"}
					</Button>
					<span className="eyebrow text-ink-faint">{isSoundEnabled ? "On" : "Off"}</span>
					{isSoundEnabled && (
						<Button variant="ghost" onClick={playMessageChime}>
							Preview
						</Button>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-4 border-t border-rule pt-6">
				{permission === "unsupported" ? (
					<p className="text-[13px] text-ink-soft">This browser cannot show desktop notifications.</p>
				) : (
					<>
						<p className="text-[13px] text-ink-soft">
							Show a notification when a message arrives and this tab is not the one you are looking at.
							The setting applies to this browser only.
						</p>

						{permission === "denied" ? (
							<p
								role="status"
								className="rounded-control border border-rule bg-paper-raised px-3 py-2.5 text-[13px] text-ink-soft"
							>
								This browser is blocking notifications for Chatty. Allow them in its site settings, then
								come back.
							</p>
						) : (
							<div className="flex items-center gap-3">
								<Button
									variant={isEnabled ? "outline" : "primary"}
									onClick={isEnabled ? disable : () => void enable()}
								>
									{isEnabled ? "Turn notifications off" : "Turn notifications on"}
								</Button>
								<span className="eyebrow text-ink-faint">
									{isEnabled ? "On for this browser" : "Off"}
								</span>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
