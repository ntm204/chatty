import { Fragment } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import type { CurrentUserDTO } from "@chatty/shared-types";
import { SETTINGS_NAVIGATION } from "../constants/settings";
import type { SettingsSection } from "../types/settings";

interface SettingsNavProps {
	user: CurrentUserDTO;
	activeSection: SettingsSection;
	onSelect: (section: SettingsSection) => void;
}

/** The dialog's account identity and category navigation, horizontal on phones. */
export function SettingsNav({ user, activeSection, onSelect }: SettingsNavProps) {
	return (
		<div className="settings-nav flex w-[250px] shrink-0 flex-col border-r border-rule bg-paper-raised max-sm:w-full max-sm:border-b max-sm:border-r-0">
			<h2 className="px-5 pb-4 pt-5 font-display text-[22px] leading-none tracking-tight">Your little corner</h2>

			<div className="flex items-center gap-3 px-5 pb-4">
				<Avatar user={user} size="sm" />
				<div className="min-w-0">
					<p className="truncate text-[13.5px] font-semibold leading-tight">{user.displayName}</p>
					<p className="meta truncate text-ink-faint">@{user.handle}</p>
				</div>
			</div>

			<div className="h-px bg-rule" />

			<nav aria-label="Settings categories" className="flex flex-col gap-px p-2.5">
				{SETTINGS_NAVIGATION.map((item) => {
					const isActive = item.id === activeSection;

					return (
						<Fragment key={item.id}>
							{/* The rule is what makes the last row read as a different
							    kind of thing from the three above it. */}
							{item.isDestructive && <div className="mx-3 my-2 h-px bg-rule-soft" />}
							<Button
								variant="ghost"
								onClick={() => onSelect(item.id)}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"relative w-full justify-start gap-3 px-3 py-2.5 text-[13.5px]",
									isActive && "bg-paper font-semibold text-ink",
									!isActive && item.isDestructive && "text-signal hover:bg-signal-soft",
									!isActive && !item.isDestructive && "text-ink-soft hover:text-ink",
								)}
							>
								{isActive && <span className="absolute inset-y-2 left-0 w-0.5 bg-signal" />}
								<item.icon
									aria-hidden="true"
									className={cn(
										"size-4 shrink-0",
										!isActive && !item.isDestructive && "text-ink-faint",
									)}
								/>
								{item.label}
							</Button>
						</Fragment>
					);
				})}
			</nav>
		</div>
	);
}
