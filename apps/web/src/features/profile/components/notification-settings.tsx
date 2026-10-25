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
	const isMessagePreviewEnabled = useNotificationSetting((state) => state.isMessagePreviewEnabled);
	const setMessagePreviewEnabled = useNotificationSetting((state) => state.setMessagePreviewEnabled);
	const isSoundEnabled = useSoundSetting((state) => state.isEnabled);
	const enableSound = useSoundSetting((state) => state.enable);
	const disableSound = useSoundSetting((state) => state.disable);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4">
				<p className="text-[13px] text-ink-soft">Sound for messages in other chats.</p>
				<div className="flex items-center gap-3">
					<Button
						variant={isSoundEnabled ? "outline" : "primary"}
						onClick={isSoundEnabled ? disableSound : enableSound}
					>
						{isSoundEnabled ? "Turn sound off" : "Turn sound on"}
					</Button>
					<span className="note text-ink-faint">{isSoundEnabled ? "On" : "Off"}</span>
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
						<p className="text-[13px] text-ink-soft">Notify while you're away. This browser only.</p>

						{permission === "denied" ? (
							<p
								role="status"
								className="rounded-control border border-rule bg-paper-raised px-3 py-2.5 text-[13px] text-ink-soft"
							>
								Notifications blocked. Allow them in your browser’s site settings.
							</p>
						) : (
							<div className="flex flex-col gap-3">
								<div className="flex items-center gap-3">
									<Button
										variant={isEnabled ? "outline" : "primary"}
										onClick={isEnabled ? disable : () => void enable()}
									>
										{isEnabled ? "Turn notifications off" : "Turn notifications on"}
									</Button>
									<span className="note text-ink-faint">
										{isEnabled ? "On for this browser" : "Off"}
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-3">
									<Button
										variant={isMessagePreviewEnabled ? "outline" : "primary"}
										onClick={() => setMessagePreviewEnabled(!isMessagePreviewEnabled)}
									>
										{isMessagePreviewEnabled ? "Hide message preview" : "Show message preview"}
									</Button>
									<span className="note text-ink-faint">
										{isMessagePreviewEnabled ? "Sender and text shown" : "Details hidden"}
									</span>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
