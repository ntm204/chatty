import type { CurrentUserDTO } from "@chatty/shared-types";
import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/button";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { useDialog } from "@/hooks/use-dialog";
import { SETTINGS_NAVIGATION } from "../constants/settings";
import type { SettingsSection } from "../types/settings";
import { AppearanceSettings } from "./appearance-settings";
import { BlockedUsersSettings } from "./blocked-users-settings";
import { ChangeEmailForm } from "./change-email-form";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";
import { NotificationSettings } from "./notification-settings";
import { ProfileForm } from "./profile-form";
import { RestrictedUsersSettings } from "./restricted-users-settings";
import { SettingsNav } from "./settings-nav";

interface SettingsModalProps {
	user: CurrentUserDTO;
	onClose: () => void;
}

/**
 * Account settings, over the conversation rather than instead of it.
 *
 * This used to be a route that replaced the whole screen. Renaming yourself is
 * twenty seconds of work, and paying for it with the conversation you were
 * reading is a bad trade — so `/profile` now renders the chat underneath and
 * this on top of it. The URL is unchanged, which is what keeps the link
 * shareable and the browser's Back button meaningful: Back closes the dialog.
 *
 * `onClose` must be stable — `useDialog` re-binds its key listener when it is
 * not.
 */
export function SettingsModal({ user, onClose }: SettingsModalProps) {
	const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
	const titleId = useId();
	const dialogRef = useDialog<HTMLElement>(onClose);

	const activeItem = SETTINGS_NAVIGATION.find((item) => item.id === activeSection) ?? SETTINGS_NAVIGATION[0]!;

	return (
		<div
			className="fixed inset-0 z-40 flex items-center justify-center bg-scrim/30 p-4 dark:bg-scrim/55"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				// Tall enough that the longest category — the profile form — fits
				// without its Save button landing half under the footer, and capped
				// at the viewport so a short window scrolls the category instead of
				// pushing the dialog off screen.
				className="settings-dialog flex h-[min(720px,100%)] w-full max-w-[920px] overflow-hidden rounded-panel border border-rule bg-paper shadow-modal outline-none max-sm:flex-col"
			>
				<SettingsNav user={user} activeSection={activeSection} onSelect={setActiveSection} />

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-7 py-5">
						<div className="min-w-0">
							<h2 id={titleId} className="text-[19px] font-bold tracking-tight">
								{activeItem.label}
							</h2>
							<p className="mt-1.5 text-[13.5px] leading-normal text-ink-soft">
								{activeItem.description}
							</p>
						</div>
						<Button
							variant="ghost"
							onClick={onClose}
							aria-label="Close settings"
							className="size-8 shrink-0 border border-rule p-0"
						>
							<X className="size-3.5" />
						</Button>
					</header>

					<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 py-6">
						{activeSection === "profile" && (
							<>
								{/* The picture is not a field on the form: it saves the
								    moment a file is chosen, through its own endpoint, and
								    putting it above the rule says so without a sentence. */}
								<CurrentUserAvatar user={user} />
								<div className="h-px bg-rule-soft" />
								<ProfileForm user={user} />
							</>
						)}
						{activeSection === "blocked" && <BlockedUsersSettings />}
						{activeSection === "restricted" && <RestrictedUsersSettings />}
						{activeSection === "appearance" && <AppearanceSettings />}
						{activeSection === "email" && <ChangeEmailForm user={user} />}
						{activeSection === "notifications" && <NotificationSettings />}
						{activeSection === "security" && <ChangePasswordForm />}
						{activeSection === "danger" && <DeleteAccountForm />}
					</div>

					<footer className="flex shrink-0 items-center border-t border-rule bg-paper-raised px-7 py-3.5">
						<span className="eyebrow text-ink-faint">Esc to close</span>
					</footer>
				</div>
			</section>
		</div>
	);
}
